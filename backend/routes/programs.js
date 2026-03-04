const express = require("express");
const pool = require("../db");
const authMiddleware = require("../middleware/auth");

const router = express.Router();

function normalizeProgramItems(items) {
  if (!Array.isArray(items)) {
    return [];
  }

  return items
    .filter((item) => item && (item.workoutId || item.name))
    .map((item) => ({
      workoutId: item.workoutId || null,
      name: item.name || "",
      repetitions: Number.isInteger(Number(item.repetitions)) ? Number(item.repetitions) : 0,
      weightKg: Number.isInteger(Number(item.weightKg)) ? Number(item.weightKg) : 0,
    }));
}

function normalizeWorkoutDateValue(inputDate) {
  const date = inputDate ? new Date(inputDate) : new Date();
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date.toISOString();
}

router.get("/", authMiddleware, async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT id, title, description, workout_dates, deleted, created_at FROM fitness_programs WHERE user_id = $1 AND deleted = FALSE ORDER BY created_at DESC",
      [req.user.id]
    );

    return res.json(result.rows);
  } catch (error) {
    console.error("Programs fetch error:", error.message);
    return res.status(500).json({ message: "Server error while fetching programs" });
  }
});

router.post("/", authMiddleware, async (req, res) => {
  const { title, description } = req.body;

  if (!title) {
    return res.status(400).json({ message: "title is required" });
  }

  const programItems = normalizeProgramItems(description);

  if (programItems.length === 0) {
    return res.status(400).json({ message: "description must include at least one workout item" });
  }

  try {
    const result = await pool.query(
      "INSERT INTO fitness_programs (user_id, title, description) VALUES ($1, $2, $3) RETURNING id, title, description, workout_dates, deleted, created_at",
      [req.user.id, title, JSON.stringify(programItems)]
    );

    return res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error("Program create error:", error.message);
    return res.status(500).json({ message: "Server error while creating program" });
  }
});

router.put("/:id", authMiddleware, async (req, res) => {
  const { id } = req.params;
  const { title, description } = req.body;

  if (!title) {
    return res.status(400).json({ message: "title is required" });
  }

  const programItems = normalizeProgramItems(description);

  if (programItems.length === 0) {
    return res.status(400).json({ message: "description must include at least one workout item" });
  }

  try {
    const result = await pool.query(
      `
        UPDATE fitness_programs
        SET title = $1, description = $2
        WHERE id = $3 AND user_id = $4
        RETURNING id, title, description, workout_dates, deleted, created_at
      `,
      [title, JSON.stringify(programItems), id, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Program not found" });
    }

    return res.json(result.rows[0]);
  } catch (error) {
    console.error("Program update error:", error.message);
    return res.status(500).json({ message: "Server error while updating program" });
  }
});

router.post("/:id/workout-dates", authMiddleware, async (req, res) => {
  const { id } = req.params;
  const normalizedDate = normalizeWorkoutDateValue(req.body?.date);

  if (!normalizedDate) {
    return res.status(400).json({ message: "Invalid date value" });
  }

  try {
    const programResult = await pool.query(
      "SELECT workout_dates FROM fitness_programs WHERE id = $1 AND user_id = $2 AND deleted = FALSE",
      [id, req.user.id]
    );

    if (programResult.rows.length === 0) {
      return res.status(404).json({ message: "Program not found" });
    }

    const existingDates = Array.isArray(programResult.rows[0].workout_dates)
      ? programResult.rows[0].workout_dates
      : [];

    const updatedDates = Array.from(new Set([...existingDates, normalizedDate])).sort();

    const result = await pool.query(
      `
        UPDATE fitness_programs
        SET workout_dates = $1
        WHERE id = $2 AND user_id = $3
        RETURNING id, title, description, workout_dates, deleted, created_at
      `,
      [JSON.stringify(updatedDates), id, req.user.id]
    );

    return res.json(result.rows[0]);
  } catch (error) {
    console.error("Workout date add error:", error.message);
    return res.status(500).json({ message: "Server error while adding workout date" });
  }
});

router.delete("/:id/workout-dates", authMiddleware, async (req, res) => {
  const { id } = req.params;
  const normalizedDate = normalizeWorkoutDateValue(req.body?.date);

  if (!normalizedDate) {
    return res.status(400).json({ message: "Invalid date value" });
  }

  try {
    const programResult = await pool.query(
      "SELECT workout_dates FROM fitness_programs WHERE id = $1 AND user_id = $2 AND deleted = FALSE",
      [id, req.user.id]
    );

    if (programResult.rows.length === 0) {
      return res.status(404).json({ message: "Program not found" });
    }

    const existingDates = Array.isArray(programResult.rows[0].workout_dates)
      ? programResult.rows[0].workout_dates
      : [];

    const updatedDates = existingDates.filter((dateValue) => dateValue !== normalizedDate);

    const result = await pool.query(
      `
        UPDATE fitness_programs
        SET workout_dates = $1
        WHERE id = $2 AND user_id = $3
        RETURNING id, title, description, workout_dates, deleted, created_at
      `,
      [JSON.stringify(updatedDates), id, req.user.id]
    );

    return res.json(result.rows[0]);
  } catch (error) {
    console.error("Workout date delete error:", error.message);
    return res.status(500).json({ message: "Server error while deleting workout date" });
  }
});

router.delete("/:id", authMiddleware, async (req, res) => {
  const { id } = req.params;

  try {
    const result = await pool.query(
      `
        UPDATE fitness_programs
        SET deleted = TRUE
        WHERE id = $1 AND user_id = $2
        RETURNING id, title, description, workout_dates, deleted, created_at
      `,
      [id, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Program not found" });
    }

    return res.json({ message: "Program soft-deleted", program: result.rows[0] });
  } catch (error) {
    console.error("Program soft-delete error:", error.message);
    return res.status(500).json({ message: "Server error while deleting program" });
  }
});

module.exports = router;
