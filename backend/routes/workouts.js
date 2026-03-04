const express = require("express");
const pool = require("../db");
const authMiddleware = require("../middleware/auth");

const router = express.Router();

function normalizeWorkoutItem(item) {
  return {
    name: item?.workout || item?.name,
    description: item?.description || null,
    muscleGroup: item?.muscle_group || item?.muscleGroup || null,
  };
}

router.get("/", authMiddleware, async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT id, name, description, muscle_group, created_at FROM workouts ORDER BY name ASC"
    );

    return res.json(result.rows);
  } catch (error) {
    console.error("Workouts fetch error:", error.message);
    return res.status(500).json({ message: "Server error while fetching workouts" });
  }
});

router.post("/", authMiddleware, async (req, res) => {
  const { name, description, muscleGroup } = normalizeWorkoutItem(req.body);

  if (!name) {
    return res.status(400).json({ message: "name is required" });
  }

  try {
    const result = await pool.query(
      `
        INSERT INTO workouts (name, description, muscle_group)
        VALUES ($1, $2, $3)
        RETURNING id, name, description, muscle_group, created_at
      `,
      [name, description || null, muscleGroup || null]
    );

    return res.status(201).json(result.rows[0]);
  } catch (error) {
    if (error.code === "23505") {
      return res.status(409).json({ message: "Workout already exists" });
    }

    console.error("Workout create error:", error.message);
    return res.status(500).json({ message: "Server error while creating workout" });
  }
});

router.post("/bulk", authMiddleware, async (req, res) => {
  const payload = req.body;

  if (!Array.isArray(payload) || payload.length === 0) {
    return res.status(400).json({ message: "Body must be a non-empty JSON array" });
  }

  const inserted = [];
  const skipped = [];

  try {
    for (const item of payload) {
      const { name, description, muscleGroup } = normalizeWorkoutItem(item);

      if (!name) {
        skipped.push({
          workout: item?.workout || item?.name || null,
          reason: "Missing workout/name field",
        });
        continue;
      }

      const result = await pool.query(
        `
          INSERT INTO workouts (name, description, muscle_group)
          VALUES ($1, $2, $3)
          ON CONFLICT (name) DO NOTHING
          RETURNING id, name, description, muscle_group, created_at
        `,
        [name, description, muscleGroup]
      );

      if (result.rows.length === 0) {
        skipped.push({ workout: name, reason: "Already exists" });
      } else {
        inserted.push(result.rows[0]);
      }
    }

    return res.status(201).json({
      message: "Bulk workout import completed",
      total: payload.length,
      insertedCount: inserted.length,
      skippedCount: skipped.length,
      inserted,
      skipped,
    });
  } catch (error) {
    console.error("Workout bulk create error:", error.message);
    return res.status(500).json({ message: "Server error while bulk creating workouts" });
  }
});

module.exports = router;
