const express = require("express");
const pool = require("../db");
const authMiddleware = require("../middleware/auth");

const router = express.Router();

// ─── Streaks ─────────────────────────────────────────────────────────────────

function computeStreaks(programs) {
  const dateSet = new Set();

  for (const program of programs) {
    const dates = Array.isArray(program.workout_dates) ? program.workout_dates : [];
    for (const d of dates) {
      const parsed = new Date(d);
      if (!Number.isNaN(parsed.getTime())) {
        dateSet.add(parsed.toISOString().slice(0, 10));
      }
    }
  }

  if (dateSet.size === 0) {
    return { currentStreak: 0, longestStreak: 0, totalDays: 0 };
  }

  const sorted = Array.from(dateSet).sort();
  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

  let longestStreak = 1;
  let runningStreak = 1;

  for (let i = 1; i < sorted.length; i++) {
    const prev = new Date(sorted[i - 1]);
    const curr = new Date(sorted[i]);
    const diffMs = curr.getTime() - prev.getTime();

    if (diffMs === 86400000) {
      runningStreak++;
      if (runningStreak > longestStreak) longestStreak = runningStreak;
    } else {
      runningStreak = 1;
    }
  }

  // Current streak: count backwards from today (or yesterday if no workout today yet)
  let currentStreak = 0;
  const lastDate = sorted[sorted.length - 1];

  if (lastDate === today || lastDate === yesterday) {
    currentStreak = 1;
    let checkDate = lastDate;

    for (let i = sorted.length - 2; i >= 0; i--) {
      const expected = new Date(new Date(checkDate).getTime() - 86400000).toISOString().slice(0, 10);
      if (sorted[i] === expected) {
        currentStreak++;
        checkDate = sorted[i];
      } else {
        break;
      }
    }
  }

  return {
    currentStreak,
    longestStreak,
    totalDays: dateSet.size,
  };
}

// GET /api/stats/streaks
router.get("/streaks", authMiddleware, async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT workout_dates FROM fitness_programs WHERE user_id = $1 AND deleted = FALSE",
      [req.user.id]
    );

    const streaks = computeStreaks(result.rows);
    return res.json(streaks);
  } catch (error) {
    console.error("Streaks error:", error.message);
    return res.status(500).json({ message: "Server error while computing streaks" });
  }
});

// ─── Personal Records ────────────────────────────────────────────────────────

// GET /api/stats/personal-records
router.get("/personal-records", authMiddleware, async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT id, exercise_name, weight_kg, reps, recorded_at FROM personal_records WHERE user_id = $1 ORDER BY exercise_name ASC",
      [req.user.id]
    );

    return res.json(result.rows);
  } catch (error) {
    console.error("Get PRs error:", error.message);
    return res.status(500).json({ message: "Server error while fetching personal records" });
  }
});

// POST /api/stats/personal-records
router.post("/personal-records", authMiddleware, async (req, res) => {
  const { exercise_name, weight_kg, reps } = req.body;

  if (!exercise_name || typeof exercise_name !== "string" || !exercise_name.trim()) {
    return res.status(400).json({ message: "exercise_name is required" });
  }

  const w = parseFloat(weight_kg);
  if (Number.isNaN(w) || w <= 0 || w > 9999) {
    return res.status(400).json({ message: "weight_kg must be a positive number up to 9999" });
  }

  const r = reps != null ? parseInt(reps, 10) : 1;
  if (Number.isNaN(r) || r < 1 || r > 999) {
    return res.status(400).json({ message: "reps must be between 1 and 999" });
  }

  const name = exercise_name.trim().slice(0, 180);

  try {
    // Upsert: only update if new weight is higher, or same weight with more reps
    const result = await pool.query(
      `INSERT INTO personal_records (user_id, exercise_name, weight_kg, reps, recorded_at)
       VALUES ($1, $2, $3, $4, NOW())
       ON CONFLICT (user_id, exercise_name)
       DO UPDATE SET
         weight_kg = CASE
           WHEN EXCLUDED.weight_kg > personal_records.weight_kg THEN EXCLUDED.weight_kg
           WHEN EXCLUDED.weight_kg = personal_records.weight_kg AND EXCLUDED.reps > personal_records.reps THEN personal_records.weight_kg
           ELSE personal_records.weight_kg
         END,
         reps = CASE
           WHEN EXCLUDED.weight_kg > personal_records.weight_kg THEN EXCLUDED.reps
           WHEN EXCLUDED.weight_kg = personal_records.weight_kg AND EXCLUDED.reps > personal_records.reps THEN EXCLUDED.reps
           ELSE personal_records.reps
         END,
         recorded_at = CASE
           WHEN EXCLUDED.weight_kg > personal_records.weight_kg THEN NOW()
           WHEN EXCLUDED.weight_kg = personal_records.weight_kg AND EXCLUDED.reps > personal_records.reps THEN NOW()
           ELSE personal_records.recorded_at
         END
       RETURNING id, exercise_name, weight_kg, reps, recorded_at`,
      [req.user.id, name, w, r]
    );

    const record = result.rows[0];
    const isNewRecord = parseFloat(record.weight_kg) === w && record.reps === r;

    return res.status(201).json({ ...record, isNewRecord });
  } catch (error) {
    console.error("Save PR error:", error.message);
    return res.status(500).json({ message: "Server error while saving personal record" });
  }
});

// DELETE /api/stats/personal-records/:id
router.delete("/personal-records/:id", authMiddleware, async (req, res) => {
  const { id } = req.params;

  try {
    const result = await pool.query(
      "DELETE FROM personal_records WHERE id = $1 AND user_id = $2 RETURNING id",
      [id, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Record not found" });
    }

    return res.json({ message: "Personal record deleted" });
  } catch (error) {
    console.error("Delete PR error:", error.message);
    return res.status(500).json({ message: "Server error while deleting personal record" });
  }
});

// ─── Body Metrics Log ────────────────────────────────────────────────────────

// GET /api/stats/body-metrics-log
router.get("/body-metrics-log", authMiddleware, async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT id, weight_kg, body_fat_pct, note, logged_at FROM body_metrics_log WHERE user_id = $1 ORDER BY logged_at DESC LIMIT 50",
      [req.user.id]
    );

    return res.json(result.rows);
  } catch (error) {
    console.error("Get body metrics log error:", error.message);
    return res.status(500).json({ message: "Server error while fetching body metrics log" });
  }
});

// POST /api/stats/body-metrics-log
router.post("/body-metrics-log", authMiddleware, async (req, res) => {
  const { weight_kg, body_fat_pct, note } = req.body;

  const w = weight_kg != null && weight_kg !== "" ? parseFloat(weight_kg) : null;
  const bf = body_fat_pct != null && body_fat_pct !== "" ? parseFloat(body_fat_pct) : null;

  if (w == null && bf == null) {
    return res.status(400).json({ message: "Provide at least weight_kg or body_fat_pct" });
  }
  if (w != null && (Number.isNaN(w) || w < 20 || w > 500)) {
    return res.status(400).json({ message: "weight_kg must be between 20 and 500" });
  }
  if (bf != null && (Number.isNaN(bf) || bf < 1 || bf > 70)) {
    return res.status(400).json({ message: "body_fat_pct must be between 1 and 70" });
  }

  const safeNote = note ? String(note).trim().slice(0, 250) : null;

  try {
    const result = await pool.query(
      "INSERT INTO body_metrics_log (user_id, weight_kg, body_fat_pct, note) VALUES ($1, $2, $3, $4) RETURNING id, weight_kg, body_fat_pct, note, logged_at",
      [req.user.id, w, bf, safeNote]
    );

    return res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error("Save body metrics log error:", error.message);
    return res.status(500).json({ message: "Server error while saving body metrics entry" });
  }
});

// DELETE /api/stats/body-metrics-log/:id
router.delete("/body-metrics-log/:id", authMiddleware, async (req, res) => {
  const { id } = req.params;

  try {
    const result = await pool.query(
      "DELETE FROM body_metrics_log WHERE id = $1 AND user_id = $2 RETURNING id",
      [id, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Entry not found" });
    }

    return res.json({ message: "Body metrics entry deleted" });
  } catch (error) {
    console.error("Delete body metrics log error:", error.message);
    return res.status(500).json({ message: "Server error while deleting body metrics entry" });
  }
});

module.exports = router;
