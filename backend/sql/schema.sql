CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  last_advice_at TIMESTAMP,
  last_advice_text TEXT,
  height_cm NUMERIC(5,1),
  weight_kg NUMERIC(5,1),
  created_at TIMESTAMP DEFAULT NOW()
);

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

CREATE TABLE IF NOT EXISTS workouts (
  id SERIAL PRIMARY KEY,
  name VARCHAR(140) UNIQUE NOT NULL,
  description TEXT,
  muscle_group VARCHAR(120),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS advice_knowledge_chunks (
  id SERIAL PRIMARY KEY,
  title VARCHAR(180) NOT NULL,
  content TEXT NOT NULL,
  tags TEXT[] DEFAULT ARRAY[]::TEXT[],
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS body_metrics_log (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  weight_kg NUMERIC(5,1),
  body_fat_pct NUMERIC(4,1),
  note VARCHAR(250),
  logged_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS personal_records (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  exercise_name VARCHAR(180) NOT NULL,
  weight_kg NUMERIC(6,1) NOT NULL,
  reps INTEGER NOT NULL DEFAULT 1,
  recorded_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, exercise_name)
);
