require("dotenv").config({ path: require("path").join(__dirname, "../.env") });
const pool = require("../db");

const eqLabel = "home setup with dumbbells only";

const systemPrompt =
  process.env.ADVICE_SYSTEM_PROMPT ||
  `You are an expert, safety-first fitness coach. Analyse the workout programs, identify missing movement patterns and undertrained muscle groups, and give targeted advice on what to add or improve. The user has access to: ${eqLabel}. All exercise recommendations MUST be achievable with this equipment.`;

const prompt =
  `SYSTEM:\n${systemPrompt}\n\n` +
  `USER EQUIPMENT: ${eqLabel}\n\n` +
  `USER PROGRAMS:\n` +
  `  • "Home Dumbbell Full Body": Floor Dumbbell Press — 3 sets — 10 reps, Dumbbell Row — 3 sets — 10 reps, Shoulder Press — 3 sets — 12 reps, Dumbbell Concentration Curls — 3 sets — 12 reps, Overhead Triceps Extension — 3 sets — 12 reps, Squats — 4 sets — 15 reps, Calf Raises — 3 sets — 20 reps\n\n` +
  `TASK:\nBased on the program above, tell them:\n` +
  `1. Which body areas or movement patterns are missing or undertrained.\n` +
  `2. What specific exercises to add — all doable with dumbbells only.\n` +
  `3. One safety tip.\n\n` +
  `OUTPUT FORMAT:\n` +
  `- One short intro paragraph (max 60 words)\n` +
  `- 3 bullet points: each recommends a concrete exercise for a missing area\n` +
  `- One brief safety note`;

const HARDCODED_FALLBACK =
  `Your dumbbell program covers push, pull, squat, and isolation well. The main gaps are hip hinge, core stability, and rear-chain work.\n\n` +
  `- **Romanian Deadlift** — targets hamstrings and glutes via the hinge pattern; keep your back flat and lower the dumbbells along your legs.\n` +
  `- **Dumbbell Plank Row** — combines core stability with a pulling movement, fixing both gaps at once.\n` +
  `- **Reverse Dumbbell Lunge** — adds unilateral leg work and balance challenge to complement your squats.\n\n` +
  `**Safety:** On rows and RDLs keep your spine neutral throughout — avoid rounding the lower back especially as the weight increases.`;

const hfToken = process.env.HF_API_TOKEN;
const modelsToTry = [
  process.env.HF_MODEL,
  process.env.HF_FALLBACK_MODEL,
  "openai/gpt-oss-120b:fastest",
].filter(Boolean);

async function run() {
  // Ensure table + seed row exist
  await pool.query(`
    CREATE TABLE IF NOT EXISTS example_advice_cache (
      id INTEGER PRIMARY KEY,
      advice TEXT,
      generated_at TIMESTAMP DEFAULT NOW()
    );
  `);
  await pool.query(
    "INSERT INTO example_advice_cache (id) VALUES (1) ON CONFLICT (id) DO NOTHING;"
  );

  let advice = null;

  if (hfToken) {
    for (const model of modelsToTry) {
      try {
        console.log("Trying model:", model);
        const res = await fetch("https://router.huggingface.co/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${hfToken}`,
          },
          body: JSON.stringify({
            model,
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: prompt },
            ],
            max_tokens: 280,
            temperature: 0.7,
            stream: false,
          }),
        });
        const data = await res.json();
        const text = data?.choices?.[0]?.message?.content?.trim();
        if (text) {
          advice = text;
          console.log("Got advice from model:", model);
          break;
        }
        console.warn("Empty response from", model, JSON.stringify(data).slice(0, 200));
      } catch (e) {
        console.warn("Model failed:", model, e.message);
      }
    }
  } else {
    console.warn("No HF_API_TOKEN — using hardcoded fallback");
  }

  if (!advice) {
    advice = HARDCODED_FALLBACK;
    console.log("Using hardcoded fallback advice");
  }

  await pool.query(
    "UPDATE example_advice_cache SET advice = $1, generated_at = NOW() WHERE id = 1",
    [advice]
  );

  const check = await pool.query(
    "SELECT LEFT(advice, 160) AS preview FROM example_advice_cache WHERE id = 1"
  );
  console.log("\nStored successfully!\nPreview:", check.rows[0].preview);
  await pool.end();
}

run().catch((e) => {
  console.error("FATAL:", e.message);
  process.exit(1);
});
