import { useEffect, useState } from "react";
import api from "../api/api";
import Navbar from "../components/Navbar";

/* =========================
   SAFE ROLE FROM JWT
========================= */
const getRole = () => {
  try {
    const token = localStorage.getItem("token");
    if (!token) return null;
    return JSON.parse(atob(token.split(".")[1])).role;
  } catch {
    return null;
  }
};

const ROLE = getRole();
const ADMIN_ROLES = ["SUPER_ADMIN", "PRESIDENT"];

const STATUS_COLORS = {
  PENDING: "#fde68a",
  APPROVED: "#86efac",
  REJECTED: "#fecaca",
};

export default function SuggestionBox() {
  const [suggestions, setSuggestions] = useState([]);
  const [loading, setLoading] = useState(true);

  const [form, setForm] = useState({
    title: "",
    message: "",
    type: "GENERAL",
  });

  useEffect(() => {
    loadSuggestions();
  }, []);

  /* =========================
     LOAD SUGGESTIONS
  ========================= */
  const loadSuggestions = async () => {
    try {
      const url = ADMIN_ROLES.includes(ROLE)
        ? "/api/suggestions/all"
        : "/api/suggestions/my";

      const res = await api.get(url);
      setSuggestions(res.data || []);
    } catch (err) {
      console.error("Load suggestions error 👉", err);
      alert("Failed to load suggestions");
    } finally {
      setLoading(false);
    }
  };

  /* =========================
     SUBMIT SUGGESTION
  ========================= */
  const submit = async () => {
    if (!form.message) {
      alert("Message required");
      return;
    }

    try {
      await api.post("/api/suggestions", form);
      setForm({ title: "", message: "", type: "GENERAL" });
      loadSuggestions();
    } catch (err) {
      console.error("Submit suggestion error 👉", err);
      alert("Failed to submit suggestion");
    }
  };

  /* =========================
     ADMIN → UPDATE STATUS
  ========================= */
  const updateStatus = async (id, status) => {
    try {
      await api.put(`/api/suggestions/${id}/status`, { status });
      loadSuggestions();
    } catch (err) {
      console.error("Update status error 👉", err);
      alert("Action failed");
    }
  };

  return (
    <>
      <Navbar />

      <div style={page}>
        <h2 style={title}>💡 Suggestion Box</h2>

        {/* ================= CREATE ================= */}
        <div style={card}>
          <h3>Submit a Suggestion</h3>

          <input
            style={input}
            placeholder="Title (optional)"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
          />

          <select
            style={input}
            value={form.type}
            onChange={(e) => setForm({ ...form, type: e.target.value })}
          >
            <option value="GENERAL">General</option>
            <option value="IMPROVEMENT">Improvement</option>
            <option value="ISSUE">Issue</option>
          </select>

          <textarea
            style={textarea}
            placeholder="Your suggestion *"
            value={form.message}
            onChange={(e) => setForm({ ...form, message: e.target.value })}
          />

          <button style={btnPrimary} onClick={submit}>
            Submit
          </button>
        </div>

        {/* ================= LIST ================= */}
        <h3 style={{ marginBottom: 10 }}>Suggestions</h3>

        {loading && <p>Loading…</p>}
        {!loading && suggestions.length === 0 && (
          <p>No suggestions found</p>
        )}

        <div style={grid}>
          {suggestions.map((s) => (
            <div key={s.id} style={card}>
              <div style={cardHeader}>
                <strong>{s.title || "—"}</strong>
                <span
                  style={{
                    ...badge,
                    background: STATUS_COLORS[s.status],
                  }}
                >
                  {s.status}
                </span>
              </div>

              <p style={{ marginTop: 8 }}>{s.message}</p>

              <small>
                Type: {s.type}
                <br />
                By: {s.member_name || "You"}
                <br />
                {new Date(s.created_at).toLocaleString()}
              </small>

              {/* ADMIN ACTIONS */}
              {ADMIN_ROLES.includes(ROLE) && s.status === "PENDING" && (
                <div style={actionRow}>
                  <button
                    style={btnSuccess}
                    onClick={() => updateStatus(s.id, "APPROVED")}
                  >
                    Approve
                  </button>
                  <button
                    style={btnDanger}
                    onClick={() => updateStatus(s.id, "REJECTED")}
                  >
                    Reject
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

/* =========================
   🎨 STYLES
========================= */
const page = {
  padding: 30,
  background: "#f1f5f9",
  minHeight: "100vh",
};

const title = { fontSize: 26, fontWeight: 700, marginBottom: 20 };

const grid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
  gap: 16,
};

const card = {
  background: "#fff",
  padding: 18,
  borderRadius: 14,
  boxShadow: "0 8px 20px rgba(0,0,0,0.06)",
};

const cardHeader = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
};

const badge = {
  padding: "4px 10px",
  borderRadius: 12,
  fontSize: 12,
  fontWeight: 600,
};

const actionRow = {
  display: "flex",
  gap: 10,
  marginTop: 12,
};

const input = {
  width: "100%",
  padding: 10,
  marginBottom: 10,
  borderRadius: 8,
  border: "1px solid #cbd5f5",
};

const textarea = {
  width: "100%",
  height: 80,
  padding: 10,
  borderRadius: 8,
  border: "1px solid #cbd5f5",
  marginBottom: 10,
};

const btnPrimary = {
  background: "#2563eb",
  color: "#fff",
  border: "none",
  padding: "8px 16px",
  borderRadius: 8,
  cursor: "pointer",
};

const btnSuccess = {
  background: "#16a34a",
  color: "#fff",
  border: "none",
  padding: "6px 14px",
  borderRadius: 6,
  cursor: "pointer",
};

const btnDanger = {
  background: "#dc2626",
  color: "#fff",
  border: "none",
  padding: "6px 14px",
  borderRadius: 6,
  cursor: "pointer",
};
