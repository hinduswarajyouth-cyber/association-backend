const pool = require("../db");

/**
 * =====================================================
 * FINAL AUDIT LOGGER (DB MATCHED & STABLE)
 * =====================================================
 *
 * TABLE: audit_logs
 * -----------------------------------------------------
 * id            UUID
 * action        TEXT
 * entity        TEXT
 * entity_id     INTEGER
 * performed_by  VARCHAR
 * user_id       UUID   (NOT NULL)
 * metadata      JSONB
 * created_at    TIMESTAMP
 * -----------------------------------------------------
 */

module.exports = async function logAudit(
  action,
  entity,
  entityId = null,
  user = null,
  metadata = null
) {
  try {
    const performedBy =
      typeof user === "object" && user?.name ? user.name : null;

    const userId =
      typeof user === "object" && user?.id ? user.id : null;

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
        performedBy,
        userId,
        metadata,
      ]
    );
  } catch (err) {
    console.error("AUDIT LOG ERROR 👉", err.message);
  }
};
