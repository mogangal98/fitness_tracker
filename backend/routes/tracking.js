const express = require("express");
const pool = require("../db");

const router = express.Router();

// POST /api/tracking/visit
router.post("/visit", async (req, res) => {
  try {
    const ip = req.ip || "unknown";
    const result = await pool.query(
      "INSERT INTO site_visits (ip_address) VALUES ($1) RETURNING id",
      [ip]
    );
    res.json({ visitId: result.rows[0].id });
  } catch (err) {
    console.error("Tracking visit error:", err.message);
    res.status(500).json({ message: "Tracking failed" });
  }
});

// POST /api/tracking/example-advice-click
router.post("/example-advice-click", async (req, res) => {
  try {
    const visitId = parseInt(req.body?.visitId, 10);
    if (Number.isInteger(visitId) && visitId > 0) {
      await pool.query(
        "UPDATE site_visits SET clicked_example_advice = TRUE WHERE id = $1",
        [visitId]
      );
    }
    res.json({ ok: true });
  } catch (err) {
    console.error("Tracking click error:", err.message);
    res.status(500).json({ message: "Tracking failed" });
  }
});

module.exports = router;
