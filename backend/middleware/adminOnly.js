const pool = require("../db");

async function adminOnly(req, res, next) {
  try {
    const result = await pool.query("SELECT role FROM users WHERE id = $1", [req.user?.id]);
    if (result.rows[0]?.role !== "admin") {
      return res.status(403).json({ message: "Admin access required" });
    }
    // Keep req.user.role in sync for anything downstream
    req.user.role = result.rows[0].role;
    next();
  } catch {
    return res.status(500).json({ message: "Server error checking permissions" });
  }
}

module.exports = adminOnly;
