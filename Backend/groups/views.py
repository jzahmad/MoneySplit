import os
import json
import base64
import secrets
from decimal import Decimal, ROUND_HALF_UP
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.db import transaction
from django.db.models import Sum
from django.utils.timezone import now

from .models import Group, GroupMember, Expense, ExpenseSplit, Settlement

MONEY_Q = Decimal("0.01")


# -------------------------
# Utils
# -------------------------
def jerr(msg, status=400, **extra):
    payload = {"error": msg}
    payload.update(extra)
    return JsonResponse(payload, status=status)


def jok(payload=None, status=200):
    return JsonResponse(payload or {"ok": True}, status=status)


def _json(request):
    try:
        return json.loads(request.body or "{}")
    except json.JSONDecodeError:
        raise ValueError("Invalid JSON body")


def _money(v):
    try:
        return Decimal(str(v)).quantize(MONEY_Q, rounding=ROUND_HALF_UP)
    except Exception:
        raise ValueError("Invalid money value")


def _b64url_decode(s: str) -> bytes:
    s += "=" * (-len(s) % 4)
    return base64.urlsafe_b64decode(s.encode())


def auth_email(request) -> str:
    # If API Gateway authorizer injects it later, this works too
    email = request.headers.get("x-user-email")
    if email:
        return email.strip().lower()

    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        raise ValueError("Missing Authorization Bearer token")

    token = auth.split(" ", 1)[1].strip()
    parts = token.split(".")
    if len(parts) < 2:
        raise ValueError("Invalid JWT token")

    payload = json.loads(_b64url_decode(parts[1]).decode("utf-8"))
    email = payload.get("email")
    if not email:
        raise ValueError("No email in token")
    return email.strip().lower()


def _invite_code():
    return secrets.token_urlsafe(8)


def _group_members_emails(group: Group):
    return list(group.members.values_list("email", flat=True))


def _require_member(group: Group, email: str):
    if not group.members.filter(email=email).exists():
        return jerr("Not a member of this group", status=403)
    return None


# -------------------------
# Cognito Registered Check (SNS removed)
# -------------------------
def cognito_user_exists(email: str) -> bool:
    """
    Behavior:
    - If COGNITO_USER_POOL_ID is set => strict check via Cognito AdminGetUser
    - If not set => local fallback controlled by ALLOW_UNVERIFIED_MEMBERS (default true)
    """
    allow_local = os.environ.get("ALLOW_UNVERIFIED_MEMBERS", "true").lower() == "true"
    pool_id = os.environ["COGNITO_USER_POOL_ID"]
    if not pool_id:
        return allow_local  # local dev behavior

    # Lazy import so local dev doesn't crash if boto3 deps aren't installed
    import boto3

    region = os.environ.get("AWS_REGION", "us-east-1")
    client = boto3.client("cognito-idp", region_name=region)
    try:
        client.admin_get_user(UserPoolId=pool_id, Username=email)
        return True
    except client.exceptions.UserNotFoundException:
        return False


# -------------------------
# Balances
# -------------------------
def _paid_total(group: Group, email: str) -> Decimal:
    return Expense.objects.filter(group=group, payer=email).aggregate(t=Sum("amount"))["t"] or Decimal("0")


def _owed_total(group: Group, email: str) -> Decimal:
    return (
        ExpenseSplit.objects.filter(expense__group=group, member_email=email).aggregate(t=Sum("amount_owed"))["t"]
        or Decimal("0")
    )


def _settlement_out(group: Group, email: str) -> Decimal:
    return Settlement.objects.filter(group=group, from_email=email).aggregate(t=Sum("amount"))["t"] or Decimal("0")


def _settlement_in(group: Group, email: str) -> Decimal:
    return Settlement.objects.filter(group=group, to_email=email).aggregate(t=Sum("amount"))["t"] or Decimal("0")


def group_balance(group: Group, email: str) -> Decimal:
    # positive => user is owed, negative => user owes
    bal = _paid_total(group, email) - _owed_total(group, email) + _settlement_out(group, email) - _settlement_in(group, email)
    return bal.quantize(MONEY_Q)


def compute_balances(group: Group):
    return {e: float(group_balance(group, e)) for e in _group_members_emails(group)}


# -------------------------
# Split Logic
# -------------------------
def build_splits(group: Group, amount: Decimal, split_type: str, splits_payload):
    members = _group_members_emails(group)
    if not members:
        raise ValueError("Group has no members")

    split_type = (split_type or "equal").lower()

    if split_type == "equal":
        per = (amount / Decimal(len(members))).quantize(MONEY_Q)
        splits = {m: per for m in members}

        # rounding correction
        diff = (amount - sum(splits.values(), Decimal("0"))).quantize(MONEY_Q)
        i = 0
        while diff != Decimal("0.00"):
            step = Decimal("0.01") if diff > 0 else Decimal("-0.01")
            m = members[i % len(members)]
            splits[m] = (splits[m] + step).quantize(MONEY_Q)
            diff = (diff - step).quantize(MONEY_Q)
            i += 1
        return splits

    if not isinstance(splits_payload, dict) or not splits_payload:
        raise ValueError("splits required for this split_type")

    # validate emails
    for e in splits_payload.keys():
        if e not in members:
            raise ValueError(f"{e} not in group")

    if split_type == "exact":
        splits = {e: _money(v) for e, v in splits_payload.items()}
        if sum(splits.values(), Decimal("0")) != amount:
            raise ValueError("Exact splits must sum to total amount")
        return splits

    if split_type == "percent":
        perc = {e: Decimal(str(v)) for e, v in splits_payload.items()}
        if sum(perc.values(), Decimal("0")) != Decimal("100"):
            raise ValueError("Percent splits must sum to 100")
        splits = {e: (amount * perc[e] / Decimal("100")).quantize(MONEY_Q) for e in perc}

        diff = (amount - sum(splits.values(), Decimal("0"))).quantize(MONEY_Q)
        emails = list(splits.keys())
        i = 0
        while diff != Decimal("0.00"):
            step = Decimal("0.01") if diff > 0 else Decimal("-0.01")
            e = emails[i % len(emails)]
            splits[e] = (splits[e] + step).quantize(MONEY_Q)
            diff = (diff - step).quantize(MONEY_Q)
            i += 1
        return splits

    if split_type == "shares":
        shares = {e: Decimal(str(v)) for e, v in splits_payload.items()}
        total = sum(shares.values(), Decimal("0"))
        if total <= 0:
            raise ValueError("Shares total must be > 0")

        splits = {e: (amount * shares[e] / total).quantize(MONEY_Q) for e in shares}
        diff = (amount - sum(splits.values(), Decimal("0"))).quantize(MONEY_Q)
        emails = list(splits.keys())
        i = 0
        while diff != Decimal("0.00"):
            step = Decimal("0.01") if diff > 0 else Decimal("-0.01")
            e = emails[i % len(emails)]
            splits[e] = (splits[e] + step).quantize(MONEY_Q)
            diff = (diff - step).quantize(MONEY_Q)
            i += 1
        return splits

    raise ValueError("Invalid split_type (use: equal/exact/percent/shares)")


# -------------------------
# GROUPS: list/create
# -------------------------
@csrf_exempt
def groups_view(request):
    try:
        user = auth_email(request)

        if request.method == "GET":
            groups = Group.objects.filter(members__email=user).distinct().order_by("-created_at")
            data = []
            for g in groups:
                data.append(
                    {
                        "id": g.id,
                        "name": g.name,
                        "invite_code": g.invite_code,
                        "num_members": g.members.count(),
                        "balance": float(group_balance(g, user)),
                    }
                )
            return JsonResponse(data, safe=False)

        if request.method == "POST":
            body = _json(request)
            name = (body.get("name") or "").strip()
            emails = body.get("emails") or []

            if not name:
                return jerr("name required", 400)
            if not isinstance(emails, list):
                return jerr("emails must be a list", 400)

            accepted, rejected = [], []
            for e in emails:
                e = (e or "").strip().lower()
                if not e:
                    continue
                if cognito_user_exists(e):
                    accepted.append(e)
                else:
                    rejected.append(e)

            with transaction.atomic():
                g = Group.objects.create(name=name, invite_code=_invite_code(), created_at=now())
                GroupMember.objects.create(group=g, email=user)
                for e in accepted:
                    if e != user:
                        GroupMember.objects.get_or_create(group=g, email=e)

            return JsonResponse(
                {
                    "id": g.id,
                    "name": g.name,
                    "invite_code": g.invite_code,
                    "rejected_emails": rejected,
                },
                status=201,
            )

        return jerr("Method not allowed", 405)

    except ValueError as e:
        return jerr(str(e), 401)
    except Exception as e:
        return jerr("Server error", 500, detail=str(e))


# -------------------------
# GROUPS: join by invite code
# -------------------------
@csrf_exempt
def join_group_view(request):
    try:
        user = auth_email(request)
        if request.method != "POST":
            return jerr("Method not allowed", 405)

        body = _json(request)
        code = (body.get("invite_code") or "").strip()
        if not code:
            return jerr("invite_code required", 400)

        try:
            g = Group.objects.get(invite_code=code)
        except Group.DoesNotExist:
            return jerr("Invalid invite code", 404)

        GroupMember.objects.get_or_create(group=g, email=user)
        return JsonResponse({"message": "Joined", "group_id": g.id, "name": g.name})

    except ValueError as e:
        return jerr(str(e), 401)
    except Exception as e:
        return jerr("Server error", 500, detail=str(e))


# -------------------------
# GROUPS: detail CRUD (GET/PATCH/DELETE)
# -------------------------
@csrf_exempt
def group_detail_view(request, group_id: int):
    try:
        user = auth_email(request)

        try:
            g = Group.objects.get(id=group_id)
        except Group.DoesNotExist:
            return jerr("Group not found", 404)

        block = _require_member(g, user)
        if block:
            return block

        if request.method == "GET":
            # expenses
            expenses = []
            for exp in g.expenses.all().order_by("-created_at"):
                expenses.append(
                    {
                        "id": exp.id,
                        "title": exp.title,
                        "amount": float(exp.amount),
                        "payer": exp.payer,
                        "split_type": exp.split_type,
                        "created_at": exp.created_at.isoformat(),
                        "splits": list(exp.splits.values("member_email", "amount_owed")),
                    }
                )

            # settlements
            settlements = []
            for s in g.settlements.all().order_by("-created_at"):
                settlements.append(
                    {
                        "id": s.id,
                        "from_email": s.from_email,
                        "to_email": s.to_email,
                        "amount": float(s.amount),
                        "note": s.note,
                        "created_at": s.created_at.isoformat(),
                    }
                )

            return JsonResponse(
                {
                    "id": g.id,
                    "name": g.name,
                    "invite_code": g.invite_code,
                    "members": _group_members_emails(g),
                    "balances": compute_balances(g),
                    "expenses": expenses,
                    "settlements": settlements,
                }
            )

        if request.method == "PATCH":
            body = _json(request)
            if "name" in body:
                new_name = (body.get("name") or "").strip()
                if not new_name:
                    return jerr("name cannot be empty", 400)
                g.name = new_name
                g.save(update_fields=["name"])
            return JsonResponse({"message": "updated"})

        if request.method == "DELETE":
            g.delete()
            return JsonResponse({"message": "deleted"})

        return jerr("Method not allowed", 405)

    except ValueError as e:
        return jerr(str(e), 401)
    except Exception as e:
        return jerr("Server error", 500, detail=str(e))


# -------------------------
# MEMBERS: add/remove
# -------------------------
@csrf_exempt
def group_members_view(request, group_id: int):
    try:
        user = auth_email(request)
        try:
            g = Group.objects.get(id=group_id)
        except Group.DoesNotExist:
            return jerr("Group not found", 404)

        block = _require_member(g, user)
        if block:
            return block

        if request.method == "GET":
            return JsonResponse({"members": _group_members_emails(g)})

        body = _json(request)

        if request.method == "POST":
            emails = body.get("emails") or []
            if not isinstance(emails, list):
                return jerr("emails must be a list", 400)

            added, rejected = [], []
            for e in emails:
                e = (e or "").strip().lower()
                if not e:
                    continue
                if not cognito_user_exists(e):
                    rejected.append(e)
                    continue
                GroupMember.objects.get_or_create(group=g, email=e)
                added.append(e)

            return JsonResponse({"added": added, "rejected": rejected, "members": _group_members_emails(g)})

        if request.method == "DELETE":
            email = (body.get("email") or "").strip().lower()
            if not email:
                return jerr("email required", 400)

            if g.members.count() <= 1:
                return jerr("Cannot remove last member", 400)

            g.members.filter(email=email).delete()
            return JsonResponse({"message": "removed", "members": _group_members_emails(g)})

        return jerr("Method not allowed", 405)

    except ValueError as e:
        return jerr(str(e), 401)
    except Exception as e:
        return jerr("Server error", 500, detail=str(e))


# -------------------------
# EXPENSES: list/create/update/delete
# -------------------------
@csrf_exempt
def group_expenses_view(request, group_id: int):
    try:
        user = auth_email(request)
        try:
            g = Group.objects.get(id=group_id)
        except Group.DoesNotExist:
            return jerr("Group not found", 404)

        block = _require_member(g, user)
        if block:
            return block

        if request.method == "GET":
            items = []
            for exp in g.expenses.all().order_by("-created_at"):
                items.append(
                    {
                        "id": exp.id,
                        "title": exp.title,
                        "amount": float(exp.amount),
                        "payer": exp.payer,
                        "split_type": exp.split_type,
                        "created_at": exp.created_at.isoformat(),
                        "splits": list(exp.splits.values("member_email", "amount_owed")),
                    }
                )
            return JsonResponse({"expenses": items, "balances": compute_balances(g)})

        body = _json(request)

        if request.method == "POST":
            title = (body.get("title") or "").strip()
            if not title:
                return jerr("title required", 400)

            amount = _money(body.get("amount"))
            payer = (body.get("payer") or user).strip().lower()
            split_type = (body.get("split_type") or "equal").strip().lower()
            splits_payload = body.get("splits") or {}

            if payer not in _group_members_emails(g):
                return jerr("payer must be a group member", 400)

            splits = build_splits(g, amount, split_type, splits_payload)

            with transaction.atomic():
                exp = Expense.objects.create(group=g, title=title, amount=amount, payer=payer, split_type=split_type)
                for email, owed in splits.items():
                    ExpenseSplit.objects.create(expense=exp, member_email=email, amount_owed=owed)

            return JsonResponse({"message": "created", "expense_id": exp.id, "balances": compute_balances(g)}, status=201)

        if request.method == "PATCH":
            # update an expense (title, payer, amount, split_type, splits) by expense_id
            expense_id = body.get("expense_id")
            if not expense_id:
                return jerr("expense_id required", 400)

            try:
                exp = Expense.objects.get(id=expense_id, group=g)
            except Expense.DoesNotExist:
                return jerr("Expense not found", 404)

            title = (body.get("title") or exp.title).strip()
            payer = (body.get("payer") or exp.payer).strip().lower()
            amount = _money(body.get("amount") if "amount" in body else exp.amount)
            split_type = (body.get("split_type") or exp.split_type).strip().lower()
            splits_payload = body.get("splits") if "splits" in body else None

            if payer not in _group_members_emails(g):
                return jerr("payer must be a group member", 400)

            # If splits provided or split_type changes, rebuild splits
            if splits_payload is None and split_type == exp.split_type and amount == exp.amount:
                # only title/payer update
                exp.title = title
                exp.payer = payer
                exp.save(update_fields=["title", "payer"])
            else:
                if splits_payload is None:
                    # if split type not equal, require splits payload
                    splits_payload = {} if split_type == "equal" else jerr("splits required for this split_type", 400)

                splits = build_splits(g, amount, split_type, splits_payload if isinstance(splits_payload, dict) else {})
                with transaction.atomic():
                    exp.title = title
                    exp.payer = payer
                    exp.amount = amount
                    exp.split_type = split_type
                    exp.save(update_fields=["title", "payer", "amount", "split_type"])
                    exp.splits.all().delete()
                    for email, owed in splits.items():
                        ExpenseSplit.objects.create(expense=exp, member_email=email, amount_owed=owed)

            return JsonResponse({"message": "updated", "balances": compute_balances(g)})

        if request.method == "DELETE":
            expense_id = body.get("expense_id")
            if not expense_id:
                return jerr("expense_id required", 400)

            try:
                exp = Expense.objects.get(id=expense_id, group=g)
            except Expense.DoesNotExist:
                return jerr("Expense not found", 404)

            exp.delete()
            return JsonResponse({"message": "deleted", "balances": compute_balances(g)})

        return jerr("Method not allowed", 405)

    except ValueError as e:
        return jerr(str(e), 401)
    except Exception as e:
        return jerr("Server error", 500, detail=str(e))


# -------------------------
# SETTLEMENTS: list/create/delete
# -------------------------
@csrf_exempt
def group_settlements_view(request, group_id: int):
    try:
        user = auth_email(request)
        try:
            g = Group.objects.get(id=group_id)
        except Group.DoesNotExist:
            return jerr("Group not found", 404)

        block = _require_member(g, user)
        if block:
            return block

        if request.method == "GET":
            items = []
            for s in g.settlements.all().order_by("-created_at"):
                items.append(
                    {
                        "id": s.id,
                        "from_email": s.from_email,
                        "to_email": s.to_email,
                        "amount": float(s.amount),
                        "note": s.note,
                        "created_at": s.created_at.isoformat(),
                    }
                )
            return JsonResponse({"settlements": items, "balances": compute_balances(g)})

        body = _json(request)

        if request.method == "POST":
            from_email = (body.get("from_email") or user).strip().lower()
            to_email = (body.get("to_email") or "").strip().lower()
            amount = _money(body.get("amount"))
            note = (body.get("note") or "").strip()

            mem = _group_members_emails(g)
            if from_email not in mem or to_email not in mem:
                return jerr("Both users must be members", 400)
            if from_email == to_email:
                return jerr("from_email and to_email must differ", 400)
            if amount <= 0:
                return jerr("amount must be > 0", 400)

            Settlement.objects.create(group=g, from_email=from_email, to_email=to_email, amount=amount, note=note)
            return JsonResponse({"message": "created", "balances": compute_balances(g)}, status=201)

        if request.method == "DELETE":
            settlement_id = body.get("settlement_id")
            if not settlement_id:
                return jerr("settlement_id required", 400)

            try:
                s = Settlement.objects.get(id=settlement_id, group=g)
            except Settlement.DoesNotExist:
                return jerr("Settlement not found", 404)

            s.delete()
            return JsonResponse({"message": "deleted", "balances": compute_balances(g)})

        return jerr("Method not allowed", 405)

    except ValueError as e:
        return jerr(str(e), 401)
    except Exception as e:
        return jerr("Server error", 500, detail=str(e))
