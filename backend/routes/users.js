const express = require("express");
const pool = require("../db");
const authMiddleware = require("../middleware/auth");

const router = express.Router();

const VALID_EQUIPMENT = ["gym", "dumbbells", "no equipment"];

// GET /api/users/me — return profile fields
router.get("/me", authMiddleware, async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT id, name, email, equipment, role, last_advice_at, height_cm, weight_kg, body_fat_pct, created_at FROM users WHERE id = $1",
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

// PUT /api/users/me/metrics — update height, weight, and body fat
router.put("/me/metrics", authMiddleware, async (req, res) => {
  const { height_cm, weight_kg, body_fat_pct } = req.body;

  const h = height_cm != null ? parseFloat(height_cm) : null;
  const w = weight_kg != null ? parseFloat(weight_kg) : null;
  const bf = body_fat_pct != null ? parseFloat(body_fat_pct) : null;

  if (h != null && (Number.isNaN(h) || h < 50 || h > 300)) {
    return res.status(400).json({ message: "height_cm must be between 50 and 300" });
  }
  if (w != null && (Number.isNaN(w) || w < 20 || w > 500)) {
    return res.status(400).json({ message: "weight_kg must be between 20 and 500" });
  }
  if (bf != null && (Number.isNaN(bf) || bf < 1 || bf > 70)) {
    return res.status(400).json({ message: "body_fat_pct must be between 1 and 70" });
  }

  try {
    const result = await pool.query(
      "UPDATE users SET height_cm = COALESCE($1, height_cm), weight_kg = COALESCE($2, weight_kg), body_fat_pct = COALESCE($3, body_fat_pct) WHERE id = $4 RETURNING id, name, email, equipment, height_cm, weight_kg, body_fat_pct",
      [h, w, bf, req.user.id]
    );

    return res.json(result.rows[0]);
  } catch (error) {
    console.error("Update metrics error:", error.message);
    return res.status(500).json({ message: "Server error while updating metrics" });
  }
});

module.exports = router;
