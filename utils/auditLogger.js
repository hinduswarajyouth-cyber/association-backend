const pool = require("../db");

/**
 * Logs audit actions
 *
 * @param {string} action        - Action performed (LOGIN, ADD_MEMBER, APPROVE_RECEIPT)
 * @param {string} entity        - Entity type (USER, RECEIPT, FUND, etc.)
 * @param {string|number} entity_id - Entity identifier
 * @param {number|null} performed_by - User ID who performed action
 * @param {object|null} metadata - Optional extra data (JSON)
 * @param {string|null} ip_address - Optional IP address
 */
const logAudit = async (
  action,
  entity,
  entity_id,
  performed_by = null,
  metadata = null,
  ip_address = null
) => {
  try {
    await pool.query(
      `INSERT INTO audit_logs
       (action, entity, entity_id, performed_by, metadata, ip_address)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        action,
        entity,
        entity_id,
        performed_by,
        metadata ? JSON.stringify(metadata) : null,
        ip_address,
      ]
    );
  } catch (err) {
    console.error("AUDIT LOG ERROR 👉", err.message);
  }
};

module.exports = logAudit;
