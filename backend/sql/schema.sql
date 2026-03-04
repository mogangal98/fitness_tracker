CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  last_advice_at TIMESTAMP,
  last_advice_text TEXT,
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
