import { useEffect, useMemo, useState } from "react";
import { useAuth } from "react-oidc-context";
import { useNavigate } from "react-router-dom";
import { Alert, Badge, Button, Card, Col, Container, Form, Modal, Row, Spinner } from "react-bootstrap";
import api from "../Context/API";

export default function Dashboard() {
  const auth = useAuth();
  const navigate = useNavigate();
  const token = auth.user?.id_token || auth.user?.access_token;

  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  // Create group modal
  const [showCreate, setShowCreate] = useState(false);
  const [groupName, setGroupName] = useState("");
  const [emails, setEmails] = useState(""); // comma-separated
  const [rejected, setRejected] = useState([]);

  // Join group modal
  const [showJoin, setShowJoin] = useState(false);
  const [inviteCode, setInviteCode] = useState("");

  const userEmail = auth.user?.profile?.email;

  const { dues, owed } = useMemo(() => {
    let d = 0, o = 0;
    groups.forEach((g) => {
      if (g.balance > 0) o += g.balance;
      if (g.balance < 0) d += Math.abs(g.balance);
    });
    return { dues: d, owed: o };
  }, [groups]);

  const fetchGroups = async () => {
    if (!token) return navigate("/");
    try {
      setLoading(true);
      setErr("");
      const res = await fetch(`${api}/api/groups/`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `Failed: ${res.status}`);
      setGroups(data);
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!auth.isAuthenticated) return navigate("/");
    fetchGroups();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth.isAuthenticated]);

  const createGroup = async () => {
    setErr("");
    setRejected([]);
    if (!groupName.trim()) return setErr("Group name required.");

    const emailList = emails
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean);

    try {
      const res = await fetch(`${api}/api/groups/`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name: groupName, emails: emailList }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Failed to create group");

      setRejected(data.rejected_emails || []);
      setShowCreate(false);
      setGroupName("");
      setEmails("");
      await fetchGroups();
    } catch (e) {
      setErr(e.message);
    }
  };

  const joinGroup = async () => {
    setErr("");
    if (!inviteCode.trim()) return setErr("Invite code required.");

    try {
      const res = await fetch(`${api}/api/groups/join/`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ invite_code: inviteCode.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Failed to join group");

      setShowJoin(false);
      setInviteCode("");
      await fetchGroups();
    } catch (e) {
      setErr(e.message);
    }
  };

  if (loading) {
    return (
      <Container className="py-4">
        <div className="d-flex align-items-center gap-2">
          <Spinner animation="border" size="sm" />
          <div>Loading your groups...</div>
        </div>
      </Container>
    );
  }

  return (
    <Container className="py-4">
      <div className="d-flex justify-content-between align-items-start flex-wrap gap-2">
        <div>
          <h2 className="mb-1">MoneySplit</h2>
          <div className="text-muted">Signed in as {userEmail}</div>
        </div>

        <div className="d-flex gap-2">
          <Button variant="outline-primary" onClick={() => setShowJoin(true)}>
            Join Group
          </Button>
          <Button onClick={() => setShowCreate(true)}>+ Create Group</Button>
        </div>
      </div>

      {err && <Alert variant="danger" className="mt-3">{err}</Alert>}

      {rejected.length > 0 && (
        <Alert variant="warning" className="mt-3">
          These emails were not added (not registered):
          <div className="mt-2 d-flex flex-wrap gap-2">
            {rejected.map((e) => (
              <Badge key={e} bg="warning" text="dark">{e}</Badge>
            ))}
          </div>
        </Alert>
      )}

      <Row className="g-3 mt-2">
        <Col md={4}>
          <Card className="shadow-sm">
            <Card.Body>
              <div className="text-muted">You Owe</div>
              <div className="fs-3 fw-bold text-danger">${dues.toFixed(2)}</div>
            </Card.Body>
          </Card>
        </Col>
        <Col md={4}>
          <Card className="shadow-sm">
            <Card.Body>
              <div className="text-muted">You Are Owed</div>
              <div className="fs-3 fw-bold text-success">${owed.toFixed(2)}</div>
            </Card.Body>
          </Card>
        </Col>
        <Col md={4}>
          <Card className="shadow-sm">
            <Card.Body>
              <div className="text-muted">Groups</div>
              <div className="fs-3 fw-bold">{groups.length}</div>
            </Card.Body>
          </Card>
        </Col>
      </Row>
      <div className="mt-4 mb-2 fw-semibold fs-5">Your Groups</div>
      <Row className="g-3 mt-2">
        {groups.length ? (
          groups.map((g) => (
            <Col md={6} lg={4} key={g.id}>
              <Card className="shadow-sm h-100" role="button" onClick={() => navigate(`/groups/${g.id}`)}>
                <Card.Body>
                  <div className="d-flex justify-content-between align-items-start gap-2">
                    <div className="fw-semibold text-truncate">{g.name}</div>
                    <Badge bg={g.balance === 0 ? "success" : g.balance > 0 ? "primary" : "danger"}>
                      {g.balance === 0 ? "Settled" : g.balance > 0 ? `+${g.balance.toFixed(2)}` : `-${Math.abs(g.balance).toFixed(2)}`}
                    </Badge>
                  </div>
                  <div className="text-muted mt-2">{g.num_members ?? g.numOfMembers ?? 0} members</div>
                  {g.invite_code && <div className="text-muted mt-1" style={{ fontSize: 13 }}>Code: {g.invite_code}</div>}
                </Card.Body>
              </Card>
            </Col>
          ))
        ) : (
          <Col>
            <Alert variant="secondary" className="mt-3">No groups yet. Create or join one.</Alert>
          </Col>
        )}
      </Row>

      {/* Create Group Modal */}
      <Modal show={showCreate} onHide={() => setShowCreate(false)} centered>
        <Modal.Header closeButton>
          <Modal.Title>Create Group</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Form.Label>Group name</Form.Label>
          <Form.Control value={groupName} onChange={(e) => setGroupName(e.target.value)} />
          <Form.Label className="mt-3">Member emails (comma-separated)</Form.Label>
          <Form.Control
            value={emails}
            onChange={(e) => setEmails(e.target.value)}
            placeholder="a@email.com, b@email.com"
          />
          <div className="text-muted mt-2" style={{ fontSize: 13 }}>
            Only registered Cognito users will be added (backend enforces this).
          </div>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="outline-secondary" onClick={() => setShowCreate(false)}>Cancel</Button>
          <Button onClick={createGroup}>Create</Button>
        </Modal.Footer>
      </Modal>

      {/* Join Group Modal */}
      <Modal show={showJoin} onHide={() => setShowJoin(false)} centered>
        <Modal.Header closeButton>
          <Modal.Title>Join Group</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Form.Label>Invite code</Form.Label>
          <Form.Control value={inviteCode} onChange={(e) => setInviteCode(e.target.value)} placeholder="paste invite code" />
        </Modal.Body>
        <Modal.Footer>
          <Button variant="outline-secondary" onClick={() => setShowJoin(false)}>Cancel</Button>
          <Button variant="outline-primary" onClick={joinGroup}>Join</Button>
        </Modal.Footer>
      </Modal>
    </Container>
  );
}
