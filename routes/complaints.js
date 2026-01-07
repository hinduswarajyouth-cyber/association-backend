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
const OFFICE_ROLES = ["EC_MEMBER", "GENERAL_SECRETARY", "JOINT_SECRETARY"];

const STATUS_COLORS = {
  OPEN: "#fde68a",
  FORWARDED: "#bfdbfe",
  IN_PROGRESS: "#60a5fa",
  RESOLVED: "#86efac",
  CLOSED: "#e5e7eb",
};

export default function Complaint() {
  const [complaints, setComplaints] = useState([]);
  const [loading, setLoading] = useState(true);

  const [form, setForm] = useState({
    subject: "",
    description: "",
    priority: "NORMAL",
  });

  useEffect(() => {
    loadComplaints();
  }, []);

  /* =========================
     LOAD COMPLAINTS
  ========================= */
  const loadComplaints = async () => {
    try {
      let url = "/api/complaints/all";

      if (ROLE === "MEMBER") url = "/api/complaints/my";
      if (OFFICE_ROLES.includes(ROLE)) url = "/api/complaints/assigned";

      const res = await api.get(url);
      setComplaints(res.data || []);
    } catch (err) {
      console.error("Load complaints error 👉", err);
      alert("Failed to load complaints");
    } finally {
      setLoading(false);
    }
  };

  /* =========================
     CREATE COMPLAINT
  ========================= */
  const submitComplaint = async () => {
    if (!form.subject || !form.description) {
      alert("Subject & description required");
      return;
    }

    try {
      await api.post("/api/complaints/create", form);
      setForm({ subject: "", description: "", priority: "NORMAL" });
      loadComplaints();
    } catch {
      alert("Failed to submit complaint");
    }
  };

  /* =========================
     ADMIN → ASSIGN
  ========================= */
  const assignComplaint = async (id, role) => {
    if (!role) return alert("Select role");

    await api.put(`/api/complaints/assign/${id}`, {
      assigned_role: role,
    });
    loadComplaints();
  };

  /* =========================
     OFFICE → UPDATE STATUS
  ========================= */
  const updateStatus = async (id, status) => {
    if (!status) return;
    await api.put(`/api/complaints/update/${id}`, { status });
    loadComplaints();
  };

  return (
    <>
      <Navbar />

      <div style={page}>
        <h2 style={title}>📢 Complaint Management</h2>

        {/* ================= CREATE ================= */}
        {!ADMIN_ROLES.includes(ROLE) && (
          <div style={card}>
            <h3>Raise a Complaint</h3>

            <input
              style={input}
              placeholder="Subject"
              value={form.subject}
              onChange={(e) =>
                setForm({ ...form, subject: e.target.value })
              }
            />

            <textarea
              style={textarea}
              placeholder="Description"
              value={form.description}
              onChange={(e) =>
                setForm({ ...form, description: e.target.value })
              }
            />

            <select
              style={input}
              value={form.priority}
              onChange={(e) =>
                setForm({ ...form, priority: e.target.value })
              }
            >
              <option value="NORMAL">Normal</option>
              <option value="HIGH">High</option>
            </select>

            <button style={btnPrimary} onClick={submitComplaint}>
              Submit
            </button>
          </div>
        )}

        {/* ================= LIST ================= */}
        <h3 style={{ marginBottom: 10 }}>Complaints</h3>

        {loading && <p>Loading…</p>}
        {!loading && complaints.length === 0 && (
          <p>No complaints found</p>
        )}

        <div style={grid}>
          {complaints.map((c) => (
            <div key={c.id} style={card}>
              <div style={cardHeader}>
                <strong>{c.subject}</strong>
                <span
                  style={{
                    ...badge,
                    background: STATUS_COLORS[c.status],
                  }}
                >
                  {c.status}
                </span>
              </div>

              <p style={{ marginTop: 8 }}>{c.description}</p>

              <small>
                Priority: {c.priority} <br />
                By: {c.member_name || "You"} <br />
                {new Date(c.created_at).toLocaleString()}
              </small>

              {/* ADMIN ASSIGN */}
              {ADMIN_ROLES.includes(ROLE) && c.status === "OPEN" && (
                <div style={actionRow}>
                  <select
                    onChange={(e) =>
                      assignComplaint(c.id, e.target.value)
                    }
                  >
                    <option value="">Assign to</option>
                    {OFFICE_ROLES.map((r) => (
                      <option key={r} value={r}>
                        {r.replaceAll("_", " ")}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* OFFICE UPDATE */}
              {OFFICE_ROLES.includes(ROLE) &&
                ["FORWARDED", "IN_PROGRESS"].includes(c.status) && (
                  <div style={actionRow}>
                    <select
                      onChange={(e) =>
                        updateStatus(c.id, e.target.value)
                      }
                    >
                      <option value="">Update status</option>
                      <option value="IN_PROGRESS">In Progress</option>
                      <option value="RESOLVED">Resolved</option>
                    </select>
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
  gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
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
  height: 90,
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
