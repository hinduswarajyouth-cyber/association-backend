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
 * user_id       UUID
 * meta          JSONB
 * created_at    TIMESTAMP
 * -----------------------------------------------------
 *
 * @param {string} action        - CREATE | UPDATE | APPROVE | DELETE | LOGIN
 * @param {string} entity        - USER | COMPLAINT | SUGGESTION | FUND | RECEIPT
 * @param {number|null} entityId - Related record ID
 * @param {object|null} user     - req.user { id, name }
 * @param {object|null} meta     - Optional JSON data
 */

module.exports = async function logAudit(
  action,
  entity,
  entityId = null,
  user = null,
  meta = null
) {
  try {
    /* =========================
       SAFE USER DATA
    ========================= */
    const performedBy =
      typeof user === "object" && user?.name ? user.name : null;

    const userId =
      typeof user === "object" && user?.id ? user.id : null;

    /* =========================
       INSERT AUDIT LOG
    ========================= */
    await pool.query(
      `
      INSERT INTO audit_logs
        (action, entity, entity_id, performed_by, user_id, meta)
      VALUES
        ($1, $2, $3, $4, $5, $6)
      `,
      [
        action,
        entity,
        entityId,
        performedBy,
        userId,
        meta,
      ]
    );
  } catch (err) {
    console.error("AUDIT LOG ERROR 👉", err.message);
  }
};
