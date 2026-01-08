import { useEffect, useState } from "react";
import api from "../api/api";
import Navbar from "../components/Navbar";

/* =========================
   CONFIG
========================= */
const UPI_ID = "hinduswarajyouth@ybl";
const PAYEE_NAME = "Hindu Swarajya Youth";

/* =========================
   ROLE FROM TOKEN
========================= */
const getRole = () => {
  try {
    const token = localStorage.getItem("token");
    return JSON.parse(atob(token.split(".")[1])).role;
  } catch {
    return null;
  }
};

const ROLE = getRole();
const FINANCE_ROLES = ["TREASURER", "SUPER_ADMIN", "PRESIDENT"];

export default function Contribution() {
  const [funds, setFunds] = useState([]);
  const [myList, setMyList] = useState([]);
  const [pending, setPending] = useState([]);
  const [approved, setApproved] = useState([]);

  const [fundId, setFundId] = useState("");
  const [amount, setAmount] = useState("");
  const [mode, setMode] = useState("CASH");
  const [ref, setRef] = useState("");
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);

  /* =========================
     LOAD DATA
  ========================= */
  useEffect(() => {
    loadFunds();
    loadMyContributions();
    if (FINANCE_ROLES.includes(ROLE)) {
      loadPending();
      loadApproved();
    }
    // eslint-disable-next-line
  }, []);

  const loadFunds = async () => {
    const res = await api.get("/funds/list");
    setFunds(res.data.funds || []);
  };

  const loadMyContributions = async () => {
    const res = await api.get("/funds/my-contributions");
    setMyList(res.data || []);
  };

  const loadPending = async () => {
    const res = await api.get("/treasurer/pending");
    setPending(res.data.pending || []);
  };

  const loadApproved = async () => {
    const res = await api.get("/treasurer/approved");
    setApproved(res.data.approved || []);
  };

  /* =========================
     SUBMIT
  ========================= */
  const submit = async () => {
    if (!fundId || !amount) {
      alert("Select fund & amount");
      return;
    }
    if (mode !== "CASH" && !ref) {
      alert("Reference number required");
      return;
    }

    setLoading(true);
    try {
      await api.post("/funds/contribute", {
        fund_id: fundId,
        amount,
        payment_mode: mode,
        reference_no: mode === "CASH" ? null : ref,
        note,
      });

      alert("✅ Contribution submitted (Pending approval)");
      setAmount("");
      setRef("");
      setNote("");
      loadMyContributions();
      if (FINANCE_ROLES.includes(ROLE)) loadPending();
    } catch (err) {
      alert(err.response?.data?.error || "Failed");
    } finally {
      setLoading(false);
    }
  };

  /* =========================
     APPROVE / REJECT
  ========================= */
  const approve = async (id) => {
    await api.patch(`/treasurer/approve/${id}`);
    loadPending();
    loadApproved();
  };

  const reject = async (id) => {
    const reason = prompt("Reject reason?");
    if (!reason) return;
    await api.patch(`/treasurer/reject/${id}`, { reason });
    loadPending();
  };

  /* =========================
     UPI
  ========================= */
  const upiUrl =
    amount &&
    `upi://pay?pa=${UPI_ID}&pn=${encodeURIComponent(
      PAYEE_NAME
    )}&am=${amount}&cu=INR`;

  const qr =
    amount &&
    `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(
      upiUrl
    )}`;

  return (
    <>
      <Navbar />
      <div style={page}>
        <h2>💰 Contributions</h2>

        {/* ================= CREATE ================= */}
        <div style={card}>
          <h3>New Contribution</h3>

          <select value={fundId} onChange={(e) => setFundId(e.target.value)}>
            <option value="">Select Fund</option>
            {funds.map((f) => (
              <option key={f.id} value={f.id}>
                {f.fund_name}
              </option>
            ))}
          </select>

          <input
            placeholder="Amount"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />

          <select value={mode} onChange={(e) => setMode(e.target.value)}>
            <option value="CASH">Cash</option>
            <option value="UPI">UPI</option>
            <option value="BANK">Bank</option>
          </select>

          {mode === "UPI" && (
            <>
              <a href={upiUrl}>📲 Pay Now via UPI</a>
              {qr && <img src={qr} alt="UPI QR" />}
            </>
          )}

          {mode !== "CASH" && (
            <input
              placeholder="Reference No"
              value={ref}
              onChange={(e) => setRef(e.target.value)}
            />
          )}

          <textarea
            placeholder="Note (optional)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />

          <button onClick={submit} disabled={loading}>
            {loading ? "Submitting..." : "Submit"}
          </button>
        </div>

        {/* ================= MY LIST ================= */}
        <h3>📜 My Contributions</h3>
        {myList.length === 0 && <p>No contributions</p>}
        {myList.map((c) => (
          <div key={c.id} style={row}>
            {c.fund_name} – ₹{c.amount} – {c.status}
          </div>
        ))}

        {/* ================= TREASURER ================= */}
        {FINANCE_ROLES.includes(ROLE) && (
          <>
            <h3>⏳ Pending Approval</h3>
            {pending.map((p) => (
              <div key={p.id} style={row}>
                {p.member_name} – {p.fund_name} – ₹{p.amount}
                <button onClick={() => approve(p.id)}>Approve</button>
                <button onClick={() => reject(p.id)}>Reject</button>
              </div>
            ))}

            <h3>✅ Approved</h3>
            {approved.map((a) => (
              <div key={a.id} style={row}>
                {a.member_name} – {a.fund_name} – ₹{a.amount}
              </div>
            ))}
          </>
        )}
      </div>
    </>
  );
}

/* =========================
   STYLES
========================= */
const page = { padding: 30, maxWidth: 900 };
const card = {
  background: "#fff",
  padding: 16,
  borderRadius: 10,
  marginBottom: 20,
  display: "flex",
  flexDirection: "column",
  gap: 10,
};
const row = {
  background: "#f8fafc",
  padding: 10,
  borderRadius: 6,
  marginBottom: 6,
};
