import { useEffect, useMemo, useState } from "react";
import { Alert, Button, Form, Modal, Row, Col, Badge } from "react-bootstrap";

/**
 * Backend contract expected:
 * {
 *   title: string,
 *   amount: number,
 *   payer: string,
 *   split_type: "equal"|"exact"|"percent"|"shares",
 *   splits?: { [email]: number } // required for non-equal
 * }
 */
export default function ExpenseModal({
  show,
  onClose,
  members = [],
  defaultPaidBy = "",
  onSubmit,
}) {
  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [payer, setPayer] = useState(defaultPaidBy || "");
  const [splitType, setSplitType] = useState("equal");

  // For non-equal splits:
  // exact: amount for each email
  // percent: percent for each email (sum 100)
  // shares: share units for each email (sum > 0)
  const initialSplits = useMemo(() => {
    const obj = {};
    members.forEach((m) => (obj[m] = ""));
    return obj;
  }, [members]);

  const [splits, setSplits] = useState(initialSplits);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!show) return;
    setPayer(defaultPaidBy || members[0] || "");
    setSplits(initialSplits);
    setErr("");
    // do not clear title/amount automatically every time to avoid annoyance
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [show, defaultPaidBy, members.length]);

  const resetAll = () => {
    setTitle("");
    setAmount("");
    setPayer(defaultPaidBy || members[0] || "");
    setSplitType("equal");
    setSplits(initialSplits);
    setErr("");
  };

  const numAmount = Number(amount);

  const sumSplits = () => {
    let s = 0;
    for (const m of members) {
      const v = Number(splits[m]);
      if (!Number.isFinite(v)) continue;
      s += v;
    }
    return s;
  };

  const buildPayload = () => {
    if (!title.trim()) throw new Error("Title is required");
    if (!Number.isFinite(numAmount) || numAmount <= 0) throw new Error("Amount must be > 0");
    if (!payer) throw new Error("Pick a payer");

    const payload = {
      title: title.trim(),
      amount: numAmount,
      payer,
      split_type: splitType,
    };

    if (splitType === "equal") return payload;

    // build splits object only for filled values
    const out = {};
    for (const m of members) {
      const v = Number(splits[m]);
      if (!Number.isFinite(v)) throw new Error(`Invalid value for ${m}`);
      out[m] = v;
    }

    if (splitType === "exact") {
      const s = sumSplits();
      if (Math.abs(s - numAmount) > 0.01) {
        throw new Error(`Exact splits must sum to ${numAmount.toFixed(2)} (currently ${s.toFixed(2)})`);
      }
      payload.splits = out;
      return payload;
    }

    if (splitType === "percent") {
      const s = sumSplits();
      if (Math.abs(s - 100) > 0.0001) {
        throw new Error(`Percent splits must sum to 100 (currently ${s.toFixed(2)})`);
      }
      payload.splits = out;
      return payload;
    }

    if (splitType === "shares") {
      const s = sumSplits();
      if (s <= 0) {
        throw new Error("Shares total must be > 0");
      }
      payload.splits = out;
      return payload;
    }

    throw new Error("Invalid split type");
  };

  const handleSubmit = async () => {
    try {
      setErr("");
      const payload = buildPayload();
      await onSubmit(payload);
      resetAll();
      onClose();
    } catch (e) {
      setErr(e?.message || "Failed to add expense");
    }
  };

  const headerHint = () => {
    if (splitType === "equal") return "Splitting equally among all members.";
    if (splitType === "exact") return "Enter exact dollar amount per member (must sum to total).";
    if (splitType === "percent") return "Enter % per member (must sum to 100).";
    if (splitType === "shares") return "Enter share units per member (any positive totals).";
    return "";
  };

  return (
    <Modal show={show} onHide={onClose} centered size={splitType === "equal" ? "md" : "lg"}>
      <Modal.Header closeButton>
        <Modal.Title>Add Expense</Modal.Title>
      </Modal.Header>

      <Modal.Body>
        {err && <Alert variant="danger">{err}</Alert>}

        <Form>
          <Form.Group className="mb-2">
            <Form.Label>Title</Form.Label>
            <Form.Control
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Groceries"
            />
          </Form.Group>

          <Row className="g-2">
            <Col md={4}>
              <Form.Group>
                <Form.Label>Amount</Form.Label>
                <Form.Control
                  type="number"
                  step="0.01"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.00"
                />
              </Form.Group>
            </Col>

            <Col md={8}>
              <Form.Group>
                <Form.Label>Paid by</Form.Label>
                <Form.Select value={payer} onChange={(e) => setPayer(e.target.value)}>
                  {members.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </Form.Select>
              </Form.Group>
            </Col>
          </Row>

          <Form.Group className="mt-2">
            <Form.Label>Split type</Form.Label>
            <Form.Select value={splitType} onChange={(e) => setSplitType(e.target.value)}>
              <option value="equal">Equal</option>
              <option value="exact">Exact</option>
              <option value="percent">Percent</option>
              <option value="shares">Shares</option>
            </Form.Select>
          </Form.Group>

          <div className="text-muted mt-2" style={{ fontSize: 13 }}>
            {headerHint()}
          </div>

          {splitType !== "equal" && (
            <div className="mt-3">
              <div className="d-flex justify-content-between align-items-center mb-2">
                <div className="fw-semibold">Splits</div>
                <Badge bg="secondary">
                  {splitType === "exact"
                    ? `Sum: ${sumSplits().toFixed(2)}`
                    : splitType === "percent"
                    ? `Sum: ${sumSplits().toFixed(2)}%`
                    : `Total shares: ${sumSplits().toFixed(2)}`}
                </Badge>
              </div>

              <Row className="g-2">
                {members.map((m) => (
                  <Col md={6} key={m}>
                    <Form.Group>
                      <Form.Label className="text-truncate w-100">{m}</Form.Label>
                      <Form.Control
                        type="number"
                        step={splitType === "exact" ? "0.01" : "1"}
                        value={splits[m]}
                        onChange={(e) => setSplits((prev) => ({ ...prev, [m]: e.target.value }))}
                        placeholder={
                          splitType === "exact"
                            ? "0.00"
                            : splitType === "percent"
                            ? "0"
                            : "0"
                        }
                      />
                    </Form.Group>
                  </Col>
                ))}
              </Row>
            </div>
          )}
        </Form>
      </Modal.Body>

      <Modal.Footer>
        <Button variant="outline-secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button variant="outline-danger" onClick={resetAll}>
          Clear
        </Button>
        <Button onClick={handleSubmit}>Add</Button>
      </Modal.Footer>
    </Modal>
  );
}
