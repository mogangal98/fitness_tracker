const express = require("express");
const pool = require("../db");
const authMiddleware = require("../middleware/auth");

const router = express.Router();

const VALID_EQUIPMENT = ["gym", "dumbbells", "no equipment"];

// GET /api/users/me — return profile fields
router.get("/me", authMiddleware, async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT id, name, email, equipment, role, last_advice_at, created_at FROM users WHERE id = $1",
      [req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "User not found" });
    }

    return res.json(result.rows[0]);
  } catch (error) {
    console.error("Get profile error:", error.message);
    return res.status(500).json({ message: "Server error while fetching profile" });
  }
});

// PUT /api/users/me/equipment — update equipment preference
router.put("/me/equipment", authMiddleware, async (req, res) => {
  const { equipment } = req.body;

  if (!equipment || !VALID_EQUIPMENT.includes(equipment)) {
    return res.status(400).json({
      message: `equipment must be one of: ${VALID_EQUIPMENT.join(", ")}`,
    });
  }

  try {
    const result = await pool.query(
      "UPDATE users SET equipment = $1 WHERE id = $2 RETURNING id, name, email, equipment",
      [equipment, req.user.id]
    );

    return res.json(result.rows[0]);
  } catch (error) {
    console.error("Update equipment error:", error.message);
    return res.status(500).json({ message: "Server error while updating equipment" });
  }
});

module.exports = router;
