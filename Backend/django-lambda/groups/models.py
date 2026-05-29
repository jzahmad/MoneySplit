import secrets
from django.db import models

def generate_invite_code():
    return secrets.token_urlsafe(8)

class Group(models.Model):
    name = models.CharField(max_length=255)
    invite_code = models.CharField(max_length=32, unique=True, default=generate_invite_code)
    created_at = models.DateTimeField(auto_now_add=True)

class GroupMember(models.Model):
    group = models.ForeignKey(Group, on_delete=models.CASCADE, related_name="members")
    email = models.EmailField()
    joined_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ["group", "email"]

class Expense(models.Model):
    SPLIT_EQUAL = "equal"
    SPLIT_EXACT = "exact"
    SPLIT_PERCENT = "percent"
    SPLIT_SHARES = "shares"

    SPLIT_CHOICES = [
        (SPLIT_EQUAL, "Equal"),
        (SPLIT_EXACT, "Exact"),
        (SPLIT_PERCENT, "Percent"),
        (SPLIT_SHARES, "Shares"),
    ]

    group = models.ForeignKey(Group, on_delete=models.CASCADE, related_name="expenses")
    title = models.CharField(max_length=255)
    amount = models.DecimalField(max_digits=10, decimal_places=2)
    payer = models.EmailField()
    split_type = models.CharField(max_length=20, choices=SPLIT_CHOICES, default=SPLIT_EQUAL)
    created_at = models.DateTimeField(auto_now_add=True)

class ExpenseSplit(models.Model):
    expense = models.ForeignKey(Expense, on_delete=models.CASCADE, related_name="splits")
    member_email = models.EmailField()
    amount_owed = models.DecimalField(max_digits=10, decimal_places=2)

    class Meta:
        unique_together = ["expense", "member_email"]

class Settlement(models.Model):
    group = models.ForeignKey(Group, on_delete=models.CASCADE, related_name="settlements")
    from_email = models.EmailField()
    to_email = models.EmailField()
    amount = models.DecimalField(max_digits=10, decimal_places=2)
    note = models.CharField(max_length=255, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
