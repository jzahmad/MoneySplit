import { useEffect, useMemo, useState } from "react";
import { useAuth } from "react-oidc-context";
import { useNavigate, useParams } from "react-router-dom";
import {
  Alert,
  Badge,
  Button,
  Card,
  Col,
  Container,
  ListGroup,
  Modal,
  Row,
  Spinner,
  Table,
  Form,
} from "react-bootstrap";
import api from "../Context/API";
import ExpenseModal from "./Expense";

export default function Groups() {
  const { groupId } = useParams();
  const navigate = useNavigate();
  const auth = useAuth();

  const token = auth.user?.id_token || auth.user?.access_token;
  const userEmail = auth.user?.profile?.email;

  const [group, setGroup] = useState(null);
  const [balances, setBalances] = useState({});
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  const [showExpense, setShowExpense] = useState(false);

  // settlement modal
  const [showSettle, setShowSettle] = useState(false);
  const [settleFrom, setSettleFrom] = useState("");
  const [settleTo, setSettleTo] = useState("");
  const [settleAmount, setSettleAmount] = useState("");
  const [settleNote, setSettleNote] = useState("");

  const memberEmails = useMemo(() => group?.members || [], [group]);

  const fetchGroup = async () => {
    if (!token) return;
    try {
      setLoading(true);
      setErr("");

      const res = await fetch(`${api}/api/groups/${groupId}/`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();

      if (!res.ok) throw new Error(data?.error || `Failed: ${res.status}`);

      setGroup(data);
      setBalances(data.balances || {});
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (auth.isLoading) return;
    if (!auth.isAuthenticated) {
      navigate("/");
      return;
    }
    if (!groupId) {
      setErr("Invalid group id");
      setLoading(false);
      return;
    }
    fetchGroup();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId, auth.isAuthenticated, auth.isLoading]);

  const addExpense = async (payload) => {
    const res = await fetch(`${api}/api/groups/${groupId}/expenses/`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error || "Failed to create expense");
    await fetchGroup();
  };

  const deleteExpense = async (expenseId) => {
    if (!confirm("Delete this expense?")) return;

    const res = await fetch(`${api}/api/groups/${groupId}/expenses/`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ expense_id: expenseId }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error || "Failed to delete");
    await fetchGroup();
  };

  const createSettlement = async () => {
    const a = Number(settleAmount);
    if (!settleTo || !settleFrom || !Number.isFinite(a) || a <= 0) {
      setErr("Settlement needs from/to and a valid amount");
      return;
    }

    const res = await fetch(`${api}/api/groups/${groupId}/settlements/`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        from_email: settleFrom,
        to_email: settleTo,
        amount: a,
        note: settleNote,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error || "Failed to create settlement");

    setShowSettle(false);
    setSettleAmount("");
    setSettleNote("");
    await fetchGroup();
  };

  if (loading) {
    return (
      <Container className="py-4">
        <div className="d-flex align-items-center gap-2">
          <Spinner animation="border" size="sm" />
          <div>Loading group...</div>
        </div>
      </Container>
    );
  }

  if (err) {
    return (
      <Container className="py-4">
        <Alert variant="danger">{err}</Alert>
        <Button variant="outline-secondary" onClick={() => navigate("/dashboard")}>
          ← Back
        </Button>
      </Container>
    );
  }

  if (!group) return null;

  return (
    <Container className="py-4">
      <div className="d-flex justify-content-between align-items-start gap-3 flex-wrap">
        <div>
          <Button variant="outline-secondary" className="mb-3" onClick={() => navigate("/dashboard")}>
            ← Back
          </Button>
          <h2 className="mb-1">{group.name}</h2>
          <div className="text-muted">
            Invite code: <strong>{group.invite_code}</strong>
          </div>
        </div>

        <div className="d-flex gap-2">
          <Button onClick={() => setShowExpense(true)}>+ Add Expense</Button>
          <Button
            variant="outline-success"
            onClick={() => {
              setShowSettle(true);
              setSettleFrom(userEmail || memberEmails[0] || "");
              setSettleTo(memberEmails.find((m) => m !== (userEmail || "")) || "");
            }}
          >
            Record Settlement
          </Button>
        </div>
      </div>

      <Row className="g-3 mt-2">
        <Col lg={5}>
          <Card className="shadow-sm">
            <Card.Body>
              <Card.Title className="mb-3">Members & Balances</Card.Title>
              <ListGroup variant="flush">
                {memberEmails.map((email) => {
                  const b = Number(balances[email] ?? 0);
                  const variant = b === 0 ? "secondary" : b > 0 ? "success" : "danger";
                  return (
                    <ListGroup.Item key={email} className="d-flex justify-content-between align-items-center">
                      <div className="text-truncate">{email}</div>
                      <Badge bg={variant} pill>
                        {b === 0 ? "0.00" : b > 0 ? `+${b.toFixed(2)}` : b.toFixed(2)}
                      </Badge>
                    </ListGroup.Item>
                  );
                })}
              </ListGroup>
            </Card.Body>
          </Card>
        </Col>

        <Col lg={7}>
          <Card className="shadow-sm">
            <Card.Body>
              <Card.Title className="mb-3">Expenses</Card.Title>

              {group.expenses?.length ? (
                <div className="d-grid gap-3">
                  {group.expenses.map((exp) => (
                    <Card key={exp.id} className="border">
                      <Card.Body>
                        <div className="d-flex justify-content-between align-items-start gap-2">
                          <div>
                            <div className="fw-semibold">{exp.title}</div>
                            <div className="text-muted" style={{ fontSize: 14 }}>
                              Paid by {exp.payer} • {new Date(exp.created_at).toLocaleString()} •{" "}
                              <Badge bg="secondary">{exp.split_type}</Badge>
                            </div>
                          </div>

                          <div className="text-end">
                            <div className="fs-5 fw-bold">${Number(exp.amount).toFixed(2)}</div>
                            <Button size="sm" variant="outline-danger" onClick={() => deleteExpense(exp.id)}>
                              Delete
                            </Button>
                          </div>
                        </div>

                        {exp.splits?.length ? (
                          <div className="mt-3">
                            <div className="text-muted mb-1" style={{ fontSize: 14 }}>
                              Split:
                            </div>
                            <Table responsive size="sm" className="mb-0">
                              <thead>
                                <tr>
                                  <th>Member</th>
                                  <th className="text-end">Owes</th>
                                </tr>
                              </thead>
                              <tbody>
                                {exp.splits.map((s, idx) => (
                                  <tr key={idx}>
                                    <td className="text-truncate">{s.member_email}</td>
                                    <td className="text-end">${Number(s.amount_owed).toFixed(2)}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </Table>
                          </div>
                        ) : null}
                      </Card.Body>
                    </Card>
                  ))}
                </div>
              ) : (
                <Alert variant="secondary" className="mb-0">
                  No expenses yet. Add the first one!
                </Alert>
              )}
            </Card.Body>
          </Card>

          <Card className="shadow-sm mt-3">
            <Card.Body>
              <Card.Title className="mb-2">Settlements</Card.Title>
              {group.settlements?.length ? (
                <Table responsive size="sm" className="mb-0">
                  <thead>
                    <tr>
                      <th>From</th>
                      <th>To</th>
                      <th className="text-end">Amount</th>
                      <th>Note</th>
                      <th>When</th>
                    </tr>
                  </thead>
                  <tbody>
                    {group.settlements.map((s) => (
                      <tr key={s.id}>
                        <td className="text-truncate">{s.from_email}</td>
                        <td className="text-truncate">{s.to_email}</td>
                        <td className="text-end">${Number(s.amount).toFixed(2)}</td>
                        <td className="text-truncate">{s.note}</td>
                        <td>{new Date(s.created_at).toLocaleDateString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              ) : (
                <Alert variant="secondary" className="mb-0">
                  No settlements recorded yet.
                </Alert>
              )}
            </Card.Body>
          </Card>
        </Col>
      </Row>

      <ExpenseModal
        show={showExpense}
        onClose={() => setShowExpense(false)}
        members={memberEmails}
        defaultPaidBy={userEmail || memberEmails[0]}
        onSubmit={addExpense}
      />

      <Modal show={showSettle} onHide={() => setShowSettle(false)} centered>
        <Modal.Header closeButton>
          <Modal.Title>Record Settlement</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Row className="g-3">
            <Col xs={12}>
              <Form.Label>From</Form.Label>
              <Form.Select value={settleFrom} onChange={(e) => setSettleFrom(e.target.value)}>
                {memberEmails.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </Form.Select>
            </Col>
            <Col xs={12}>
              <Form.Label>To</Form.Label>
              <Form.Select value={settleTo} onChange={(e) => setSettleTo(e.target.value)}>
                {memberEmails.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </Form.Select>
            </Col>
            <Col xs={12}>
              <Form.Label>Amount</Form.Label>
              <Form.Control
                type="number"
                step="0.01"
                value={settleAmount}
                onChange={(e) => setSettleAmount(e.target.value)}
                placeholder="0.00"
              />
            </Col>
            <Col xs={12}>
              <Form.Label>Note (optional)</Form.Label>
              <Form.Control value={settleNote} onChange={(e) => setSettleNote(e.target.value)} />
            </Col>
          </Row>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="outline-secondary" onClick={() => setShowSettle(false)}>
            Cancel
          </Button>
          <Button variant="success" onClick={createSettlement}>
            Save
          </Button>
        </Modal.Footer>
      </Modal>
    </Container>
  );
}
