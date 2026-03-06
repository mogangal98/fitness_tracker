const express = require("express");
const cors = require("cors");
require("dotenv").config();

const pool = require("./db");
const authRoutes = require("./routes/auth");
const programRoutes = require("./routes/programs");
const workoutRoutes = require("./routes/workouts");
const adviceRoutes = require("./routes/advice");
const userRoutes = require("./routes/users");

const app = express();
app.use(cors());
app.use(express.json());

const port = process.env.PORT || 3001;

async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      name VARCHAR(120) NOT NULL,
      email VARCHAR(255) UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      last_advice_at TIMESTAMP,
      last_advice_text TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);

  await pool.query(`
    ALTER TABLE users
    ADD COLUMN IF NOT EXISTS last_advice_at TIMESTAMP,
    ADD COLUMN IF NOT EXISTS last_advice_text TEXT;
  `);

  await pool.query(`
    ALTER TABLE users
    ADD COLUMN IF NOT EXISTS equipment VARCHAR(30) NOT NULL DEFAULT 'no equipment';
  `);

  await pool.query(`
    ALTER TABLE users
    ADD COLUMN IF NOT EXISTS role VARCHAR(20) NOT NULL DEFAULT 'user';
  `);

  // Add CHECK constraint for role if it doesn't already exist
  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'users_role_check'
      ) THEN
        ALTER TABLE users
        ADD CONSTRAINT users_role_check
        CHECK (role IN ('admin', 'user'));
      END IF;
    END $$;
  `);

  // Add CHECK constraint if it doesn't already exist
  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'users_equipment_check'
      ) THEN
        ALTER TABLE users
        ADD CONSTRAINT users_equipment_check
        CHECK (equipment IN ('gym', 'dumbbells', 'no equipment'));
      END IF;
    END $$;
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS fitness_programs (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title VARCHAR(180) NOT NULL,
      description JSONB NOT NULL DEFAULT '[]'::jsonb,
      workout_dates JSONB NOT NULL DEFAULT '[]'::jsonb,
      last_advice_text TEXT,
      last_advice_at TIMESTAMP,
      deleted BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);

  await pool.query(`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'fitness_programs'
          AND column_name = 'description'
          AND data_type <> 'jsonb'
      ) THEN
        ALTER TABLE fitness_programs
        ALTER COLUMN description TYPE JSONB
        USING CASE
          WHEN description IS NULL OR TRIM(description::text) = '' THEN '[]'::jsonb
          ELSE jsonb_build_array(jsonb_build_object('name', description::text, 'repetitions', 0, 'weightKg', 0))
        END;
      END IF;
    END $$;
  `);

  await pool.query(`
    ALTER TABLE fitness_programs
    ALTER COLUMN description SET DEFAULT '[]'::jsonb,
    ALTER COLUMN description SET NOT NULL;
  `);

  await pool.query(`
    ALTER TABLE fitness_programs
    ADD COLUMN IF NOT EXISTS workout_dates JSONB NOT NULL DEFAULT '[]'::jsonb;
  `);

  await pool.query(`
    ALTER TABLE fitness_programs
    ADD COLUMN IF NOT EXISTS last_advice_text TEXT,
    ADD COLUMN IF NOT EXISTS last_advice_at TIMESTAMP;
  `);

  await pool.query(`
    ALTER TABLE fitness_programs
    ALTER COLUMN workout_dates SET DEFAULT '[]'::jsonb,
    ALTER COLUMN workout_dates SET NOT NULL;
  `);

  await pool.query(`
    ALTER TABLE fitness_programs
    ADD COLUMN IF NOT EXISTS deleted BOOLEAN NOT NULL DEFAULT FALSE;
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS workouts (
      id SERIAL PRIMARY KEY,
      name VARCHAR(140) UNIQUE NOT NULL,
      description TEXT,
      muscle_group VARCHAR(120),
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS advice_knowledge_chunks (
      id SERIAL PRIMARY KEY,
      title VARCHAR(180) NOT NULL,
      content TEXT NOT NULL,
      tags TEXT[] DEFAULT ARRAY[]::TEXT[],
      active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);

  await pool.query(`
    INSERT INTO advice_knowledge_chunks (title, content, tags)
    SELECT *
    FROM (
      VALUES
        (
          'Progressive Overload',
          'Increase training load gradually over time: add a little weight, reps, or set volume each week while maintaining proper form.',
          ARRAY['strength', 'progression']::TEXT[]
        ),
        (
          'Warm-up and Mobility',
          'Start each session with 5-10 minutes of dynamic warm-up and movement prep for the joints used in the workout.',
          ARRAY['warmup', 'mobility', 'injury-prevention']::TEXT[]
        ),
        (
          'Recovery and Sleep',
          'Recovery drives adaptation: target quality sleep, hydration, and rest days to improve performance and reduce injury risk.',
          ARRAY['recovery', 'sleep']::TEXT[]
        )
    ) AS seed(title, content, tags)
    WHERE NOT EXISTS (SELECT 1 FROM advice_knowledge_chunks);
  `);
}

async function initDailyAdviceResetJob() {
  try {
    await pool.query("CREATE EXTENSION IF NOT EXISTS pg_cron;");
    await pool.query(`
      SELECT cron.schedule(
        'reset_daily_user_advice',
        '0 0 * * *',
        $$UPDATE users SET last_advice_at = NULL WHERE last_advice_at IS NOT NULL;$$
      );
    `);
  } catch (error) {
    console.warn("Daily advice reset job not configured:", error.message);
  }
}

app.get("/health", (req, res) => {
  res.json({ message: "API is running" });
});

app.use("/api/auth", authRoutes);
app.use("/api/programs", programRoutes);
app.use("/api/workouts", workoutRoutes);
app.use("/api/advice", adviceRoutes);
app.use("/api/users", userRoutes);

initDb()
  .then(async () => {
    await initDailyAdviceResetJob();
    app.listen(port, () => {
      console.log(`Server running on port ${port}`);
    });
  })
  .catch((error) => {
    console.error("Failed to initialize database:", error.message);
    process.exit(1);
  });