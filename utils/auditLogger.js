const pool = require("../db");

/**
 * =====================================================
 * FINAL AUDIT LOGGER (PRODUCTION SAFE)
 * =====================================================
 *
 * TABLE: audit_logs
 * -----------------------------------------------------
 * id            UUID DEFAULT gen_random_uuid()
 * action        TEXT NOT NULL
 * entity        TEXT
 * entity_id     INTEGER
 * performed_by  VARCHAR
 * user_id       UUID NOT NULL
 * metadata      JSONB
 * created_at    TIMESTAMP DEFAULT NOW()
 * -----------------------------------------------------
 */

module.exports = async function logAudit(
  action,
  entity,
  entityId = null,
  user,
  metadata = {}
) {
  try {
    if (!user || !user.id) {
      // Never allow silent bad inserts
      console.warn("Audit skipped: missing user");
      return;
    }

    await pool.query(
      `
      INSERT INTO audit_logs
        (action, entity, entity_id, performed_by, user_id, metadata)
      VALUES
        ($1, $2, $3, $4, $5, $6)
      `,
      [
        action,
        entity,
        entityId,
        user.name || "SYSTEM",
        user.id,
        metadata,
      ]
    );
  } catch (err) {
    console.error("AUDIT LOG ERROR 👉", err.message);
  }
};
