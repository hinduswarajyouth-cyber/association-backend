const pool = require("../db");

/**
 * Logs audit actions
 * @param {string} action
 * @param {string} entity
 * @param {number} entity_id
 * @param {number} performed_by
 */
const logAudit = async (action, entity, entity_id, performed_by) => {
  try {
    await pool.query(
      `INSERT INTO audit_logs (action, entity, entity_id, performed_by)
       VALUES ($1,$2,$3,$4)`,
      [action, entity, entity_id, performed_by]
    );
  } catch (err) {
    console.error("AUDIT LOG ERROR 👉", err.message);
  }
};

module.exports = logAudit;
