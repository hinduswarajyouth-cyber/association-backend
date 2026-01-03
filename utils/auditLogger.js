const pool = require("../db");

/**
 * Logs audit actions
 *
 * @param {string} action              - Action performed (LOGIN, ADD_MEMBER, APPROVE_RECEIPT)
 * @param {string} entity              - Entity type (USER, RECEIPT, FUND, etc.)
 * @param {string|number|null} entityId - Entity identifier
 * @param {object|number|null} user     - User object {id} OR performed_by user ID
 * @param {object|null} metadata        - Optional extra data (JSON)
 * @param {object|null} req             - Express request (for IP & user-agent)
 * @param {string|null} ipOverride      - Optional manual IP address
 */
module.exports = async function logAudit(
  action,
  entity,
  entityId = null,
  user = null,
  metadata = null,
  req = null,
  ipOverride = null
) {
  try {
    /* =========================
       IP & USER AGENT
    ========================= */
    const ipAddress =
      ipOverride ||
      req?.headers?.["x-forwarded-for"]?.split(",")[0] ||
      req?.socket?.remoteAddress ||
      null;

    const userAgent = req?.headers?.["user-agent"] || null;

    /* =========================
       PERFORMED BY
    ========================= */
    const performedBy =
      typeof user === "object" ? user?.id || null : user || null;

    /* =========================
       INSERT AUDIT LOG
    ========================= */
    await pool.query(
      `
      INSERT INTO audit_logs
        (action, entity, entity_id, performed_by, ip_address, user_agent, metadata)
      VALUES
        ($1, $2, $3, $4, $5, $6, $7)
      `,
      [
        action,
        entity,
        entityId,
        performedBy,
        ipAddress,
        userAgent,
        metadata ? JSON.stringify(metadata) : null,
      ]
    );
  } catch (err) {
    console.error("AUDIT LOG ERROR 👉", err.message);
  }
};
