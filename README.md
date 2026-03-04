# Fitness Tracker

Fitness tracker built with React + Node.js.

This project lets users create and manage workout programs, track workout dates, and get AI-generated daily workout advice (Hugging Face cloud inference).
---

## Tech stack

### Frontend
- React
- Vite
- Plain CSS

### Backend
- Node.js
- Express
- JWT auth
- Neon Postgresql (free version is used for this project)

### AI
- Hugging Face Router API
- Prompt-driven advice generation
- RAG
---

## Env file

```env
PORT=3001
DATABASE_URL=postgresql_address
JWT_SECRET=secret
NODE_ENV=development
DB_SSL=true

# Hugging Face
HF_API_TOKEN=hf_xxx
HF_MODEL=katanemo/Arch-Router-1.5B:hf-inference
HF_FALLBACK_MODEL=openai/gpt-oss-120b:fastest
ADVICE_SYSTEM_PROMPT=High-level coach instructions live here; detailed RAG context is loaded from "advice_knowledge_chunks" table in db.
```


## Main API endpoints

### Health
- `GET /health`

### Auth
- `POST /api/auth/register`
- `POST /api/auth/login`

### Programs
- `GET /api/programs`
- `POST /api/programs`
- `PUT /api/programs/:id`
- `DELETE /api/programs/:id` (soft-delete)

### Program workout dates
- `POST /api/programs/:id/workout-dates`
- `DELETE /api/programs/:id/workout-dates`

### Workouts
- `GET /api/workouts`
- `POST /api/workouts`
- `POST /api/workouts/bulk`

### AI advice
- `POST /api/advice/daily`

---


## Notes
- Advice is generated using Hugging Face router chat endpoint. A free model is used for now, might change this later
- User roles and admin permissions will be added
- RAG will be imrpoved, its very basic for now (embeddings/vector search)
- Mobile app ??? (React Native)


This is a personal portfolio project im building for learning and skill development.
I am not building this for profit. Main goal is to turn my js knowledge into a working project
