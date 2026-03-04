const express = require("express");
const authMiddleware = require("../middleware/auth");
const pool = require("../db");

const router = express.Router();

function sameUtcDay(dateA, dateB) {
  return (
    dateA.getUTCFullYear() === dateB.getUTCFullYear() &&
    dateA.getUTCMonth() === dateB.getUTCMonth() &&
    dateA.getUTCDate() === dateB.getUTCDate()
  );
}

// ─── Movement pattern & muscle group keyword maps ────────────────────────────

const MOVEMENT_PATTERNS = {
  push: [
    "bench press", "push up", "pushup", "push-up",
    "overhead press", "shoulder press", "chest press",
    "dip", "incline", "decline", "fly", "flye",
    "tricep", "lateral raise", "chest fly",
  ],
  pull: [
    "pullup", "pull up", "pull-up", "chin up", "chinup",
    "row", "lat pulldown", "cable pull", "face pull",
    "rear delt", "bicep curl", "curl", "hammer curl",
  ],
  squat: [
    "squat", "leg press", "lunge", "front squat",
    "goblet squat", "hack squat", "bulgarian split squat",
    "step up", "leg extension",
  ],
  hinge: [
    "deadlift", "rdl", "romanian", "hip thrust",
    "glute bridge", "kettlebell swing", "good morning",
    "sumo deadlift", "trap bar",
  ],
  core: [
    "plank", "crunch", "sit up", "situp", "ab wheel",
    "oblique", "russian twist", "leg raise", "hollow body",
    "bird dog", "dead bug", "cable crunch", "hip flexor",
  ],
  carry: [
    "farmer", "carry", "suitcase", "loaded carry",
    "yoke", "atlas stone",
  ],
};

const MUSCLE_GROUPS = {
  chest: ["bench", "push up", "pushup", "chest", "fly", "flye", "incline", "decline", "dip"],
  back: ["row", "pullup", "pull up", "lat", "deadlift", "rdl", "face pull", "pull-up", "chin up"],
  shoulders: ["shoulder press", "overhead", "lateral raise", "front raise", "rear delt", "arnold", "delt"],
  triceps: ["tricep", "skull crusher", "close grip", "overhead extension", "pushdown", "dip"],
  biceps: ["curl", "chin up", "chinup", "hammer curl"],
  quads: ["squat", "leg press", "lunge", "leg extension", "front squat", "hack squat", "step up"],
  hamstrings: ["deadlift", "rdl", "romanian", "leg curl", "nordic", "good morning"],
  glutes: ["hip thrust", "glute bridge", "squat", "deadlift", "lunge", "rdl", "bulgarian"],
  calves: ["calf raise", "standing calf", "seated calf"],
  core: ["plank", "crunch", "sit up", "situp", "ab", "oblique", "russian twist", "leg raise", "hollow"],
};

/**
 * Analyse all exercise names from a user's programs and return:
 *   coveredPatterns, missingPatterns, coveredMuscles, missingMuscles
 */
function analyzeMuscleCoverage(programs) {
  const allExercises = [];
  for (const program of programs) {
    if (!Array.isArray(program.description)) continue;
    for (const item of program.description) {
      if (item?.name) allExercises.push(String(item.name).toLowerCase());
    }
  }

  function matches(exercise, keywords) {
    return keywords.some((kw) => exercise.includes(kw));
  }

  const coveredPatterns = [];
  const missingPatterns = [];
  for (const [pattern, keywords] of Object.entries(MOVEMENT_PATTERNS)) {
    const hit = allExercises.some((ex) => matches(ex, keywords));
    (hit ? coveredPatterns : missingPatterns).push(pattern);
  }

  const coveredMuscles = [];
  const missingMuscles = [];
  for (const [muscle, keywords] of Object.entries(MUSCLE_GROUPS)) {
    const hit = allExercises.some((ex) => matches(ex, keywords));
    (hit ? coveredMuscles : missingMuscles).push(muscle);
  }

  return { coveredPatterns, missingPatterns, coveredMuscles, missingMuscles, allExercises };
}

// ─────────────────────────────────────────────────────────────────────────────

const EQUIPMENT_LABELS = {
  gym: "full gym (barbells, cables, machines)",
  dumbbells: "home setup with dumbbells only",
  "no equipment": "bodyweight / no equipment",
};

function buildFallbackAdvice(name, programs, equipment = "gym") {
  const { missingPatterns, missingMuscles } = analyzeMuscleCoverage(programs);
  const gaps = [...new Set([...missingPatterns, ...missingMuscles])].slice(0, 4);
  const eqLabel = EQUIPMENT_LABELS[equipment] || equipment;
  const gapText = gaps.length
    ? `Consider adding exercises for: ${gaps.join(", ")} using your ${eqLabel}.`
    : "Focus on progressive overload and recovery.";
  return `Hi ${name}, daily advice: ${gapText} Warm up 10 minutes, keep controlled tempo on all lifts, and finish with mobility work.`;
}

async function getRagContext(programs) {
// Extract unique exercise terms from the user's programs to use as RAG search keywords.
// We extract the worked muscle groups and movement patterns to add it as context to our advice prompt. 
  const workoutTerms = new Set();
  for (const program of programs) {
    if (!Array.isArray(program.description)) {
      continue;
    }

    for (const item of program.description) {
      if (item?.name && String(item.name).trim()) {
        workoutTerms.add(String(item.name).trim().toLowerCase());
      }
    }
  }

  const terms = Array.from(workoutTerms).slice(0, 8);

  let query =
    "SELECT id, title, content, tags FROM advice_knowledge_chunks WHERE active = TRUE ORDER BY created_at DESC LIMIT 5";
  let params = [];

  if (terms.length > 0) {
    const conditions = [];
    terms.forEach((term, index) => {
      const paramIndex = index + 1;
      conditions.push(`LOWER(title) LIKE '%' || $${paramIndex} || '%'`);
      conditions.push(`LOWER(content) LIKE '%' || $${paramIndex} || '%'`);
    });

    query = `
      SELECT id, title, content, tags
      FROM advice_knowledge_chunks
      WHERE active = TRUE AND (${conditions.join(" OR ")})
      ORDER BY created_at DESC
      LIMIT 5
    `;
    params = terms;
  }

  const result = await pool.query(query, params);
  return result.rows;
}

function buildPrompt(name, programs, ragChunks, equipment = "gym") {
  const eqLabel = EQUIPMENT_LABELS[equipment] || equipment;
  const systemPrompt =
    process.env.ADVICE_SYSTEM_PROMPT ||
    `You are an expert, safety-first fitness coach. Analyse the user's workout programs, identify missing movement patterns and undertrained muscle groups, and give targeted advice on what to add or improve. The user has access to: ${eqLabel}. All exercise recommendations MUST be achievable with this equipment.`;

  // Build a readable program listing
  const programLines = programs.slice(0, 4).map((program) => {
    const items = Array.isArray(program.description) ? program.description.slice(0, 8) : [];
    const exerciseList = items.length
      ? items
          .map((item) => {
            const parts = [item.name];
            if (item.sets) parts.push(`${item.sets} sets`);
            if (item.repetitions) parts.push(`${item.repetitions} reps`);
            if (item.weightKg) parts.push(`${item.weightKg} kg`);
            return parts.join(" — ");
          })
          .join(", ")
      : "no exercises listed";
    return `  • "${program.title}": ${exerciseList}`;
  });

  // Muscle / movement gap analysis
  const { coveredPatterns, missingPatterns, coveredMuscles, missingMuscles } =
    analyzeMuscleCoverage(programs);

  const coverageSection = [
    `Covered movement patterns : ${coveredPatterns.length ? coveredPatterns.join(", ") : "none detected"}`,
    `MISSING movement patterns : ${missingPatterns.length ? missingPatterns.join(", ") : "none — great balance!"}`,
    `Covered muscle groups     : ${coveredMuscles.length ? coveredMuscles.join(", ") : "none detected"}`,
    `MISSING / undertrained    : ${missingMuscles.length ? missingMuscles.join(", ") : "none — great balance!"}`,
  ].join("\n");

  // we wont add any ocntext if there isno program or exercise data
  const ragText = ragChunks.length
    ? ragChunks.map((chunk, i) => `${i + 1}) ${chunk.title}: ${chunk.content}`).join("\n")
    : "No external context provided.";

  return (
    `SYSTEM:\n${systemPrompt}\n\n` +
    `USER EQUIPMENT: ${eqLabel}\n\n` +
    `USER PROGRAMS:\n${programLines.join("\n")}\n\n` +
    `MOVEMENT & MUSCLE ANALYSIS:\n${coverageSection}\n\n` +
    `COACHING KNOWLEDGE:\n${ragText}\n\n` +
    `TASK:\n` +
    `Based on the programs and gap analysis above, tell ${name}:\n` +
    `1. Which body areas or movement patterns are missing or undertrained IN THEIR SPECIFIC ROUTINE.\n` +
    `2. What specific exercises they should add to fix those gaps — ALL recommendations must be doable with: ${eqLabel}.\n` +
    `3. One safety tip relevant to their current training.\n\n` +
    `OUTPUT FORMAT:\n` +
    `- One short intro paragraph addressing the gaps by name (max 60 words)\n` +
    `- 3 bullet points: each recommends a concrete exercise or adjustment for a missing area (equipment-appropriate)\n` +
    `- One brief safety note`
  );
}

async function fetchCloudAdvice(name, programs, ragChunks, equipment = "gym") {
// fetch advice from Hugging Face Inference API using a conversational prompt with system instructions, user program context, and optional RAG knowledge chunks. We try multiple models in order of preference and fall back to a simple built-in advice generator if all fail or if no API token is configured.
  const token = process.env.HF_API_TOKEN;
  if (!token) {
    return buildFallbackAdvice(name, programs, equipment);
  }

  const prompt = buildPrompt(name, programs, ragChunks, equipment);
  const eqLabel = EQUIPMENT_LABELS[equipment] || equipment;
  const modelsToTry = Array.from(
    new Set([
      process.env.HF_MODEL,
      process.env.HF_FALLBACK_MODEL,
      "katanemo/Arch-Router-1.5B:hf-inference",
      "openai/gpt-oss-120b:fastest",
    ])
  ).filter(Boolean);

  let lastError = null;

  for (const model of modelsToTry) {
    try {
      const response = await fetch("https://router.huggingface.co/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          model,
          messages: [
            {
              role: "system",
              content:
                process.env.ADVICE_SYSTEM_PROMPT ||
                `You are an expert fitness coach. Analyse the user's workout programs, identify missing movement patterns and undertrained muscle groups, and recommend exercises achievable with their equipment (${eqLabel}). Be specific and actionable.`,
            },
            {
              role: "user",
              content: prompt,
            },
          ],
          max_tokens: 280,
          temperature: 0.7,
          stream: false,
        }),
      });

      const rawBody = await response.text();
      let data = null;
      try {
        data = rawBody ? JSON.parse(rawBody) : null;
      } catch {
        data = null;
      }

      if (!response.ok) {
        const errorText =
          data?.error ||
          data?.message ||
          rawBody?.slice(0, 240) ||
          `HF request failed with status ${response.status}`;

        throw new Error(`model=${model} status=${response.status} error=${errorText}`);
      }

      if (data?.choices?.[0]?.message?.content) {
        const generated = String(data.choices[0].message.content).trim();
        return generated || buildFallbackAdvice(name, programs);
      }

      if (typeof rawBody === "string" && rawBody.trim().length > 0) {
        return rawBody.trim();
      }
    } catch (error) {
      lastError = error;
    }
  }

  throw new Error(lastError?.message || "Failed to fetch Hugging Face advice");
}

router.post("/daily", authMiddleware, async (req, res) => {
  try {
    const requestedProgramId = Number(req.body?.programId) || null;

    const userResult = await pool.query(
      "SELECT id, name, equipment, last_advice_at, last_advice_text FROM users WHERE id = $1",
      [req.user.id]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ message: "User not found" });
    }

    const user = userResult.rows[0];
    const now = new Date();

    let targetProgramResult;
    if (requestedProgramId) {
      targetProgramResult = await pool.query(
        `
          SELECT id, title, description, last_advice_text, last_advice_at
          FROM fitness_programs
          WHERE id = $1 AND user_id = $2 AND deleted = FALSE
          LIMIT 1
        `,
        [requestedProgramId, req.user.id]
      );
    } else {
      targetProgramResult = await pool.query(
        `
          SELECT id, title, description, last_advice_text, last_advice_at
          FROM fitness_programs
          WHERE user_id = $1 AND deleted = FALSE
          ORDER BY created_at DESC
          LIMIT 1
        `,
        [req.user.id]
      );
    }

    const targetProgram = targetProgramResult.rows[0] || null;

    // Daily limit temporarily disabled.
    // Keep this block for future re-enable:
    // if (user.last_advice_at && sameUtcDay(new Date(user.last_advice_at), now)) {
    //   if (user.last_advice_text) {
    //     return res.json({
    //       advice: user.last_advice_text,
    //       generatedAt: user.last_advice_at,
    //       source: "cached",
    //       reused: true,
    //       message: "Daily free advice already used. Returning last saved advice.",
    //       programId: targetProgram?.id || null,
    //     });
    //   }
    //
    //   const lastProgramAdviceResult = await pool.query(
    //     `
    //       SELECT id, last_advice_text, last_advice_at
    //       FROM fitness_programs
    //       WHERE user_id = $1
    //         AND deleted = FALSE
    //         AND last_advice_text IS NOT NULL
    //       ORDER BY last_advice_at DESC NULLS LAST, created_at DESC
    //       LIMIT 1
    //     `,
    //     [req.user.id]
    //   );
    //
    //   if (lastProgramAdviceResult.rows.length > 0) {
    //     const lastAdvice = lastProgramAdviceResult.rows[0];
    //     return res.json({
    //       advice: lastAdvice.last_advice_text,
    //       generatedAt: lastAdvice.last_advice_at,
    //       source: "cached",
    //       reused: true,
    //       message: "Daily free advice already used. Returning last saved advice.",
    //       programId: lastAdvice.id,
    //     });
    //   }
    //
    //   return res.status(429).json({ message: "You already received your free advice today" });
    // }

    const programsResult = await pool.query(
      "SELECT title, description FROM fitness_programs WHERE user_id = $1 AND deleted = FALSE ORDER BY created_at DESC LIMIT 5",
      [req.user.id]
    );

    let advice;
    let source = "fallback";
    let fallbackReason = null;
    try {
      const ragChunks = await getRagContext(programsResult.rows); // rag context is optional. we will still generate advice without it, but it can improve relevance by providing the program, muscle coverage etc.
      advice = await fetchCloudAdvice(user.name, programsResult.rows, ragChunks, user.equipment || "gym");
      source = process.env.HF_API_TOKEN ? "cloud" : "fallback";
    } catch (cloudError) {
      console.warn("HF advice fallback:", cloudError.message);
      advice = buildFallbackAdvice(user.name, programsResult.rows, user.equipment || "gym");
      source = "fallback";
      fallbackReason = cloudError.message;
    }

    await pool.query(
      "UPDATE users SET last_advice_at = NOW(), last_advice_text = $1 WHERE id = $2",
      [advice, req.user.id]
    );

    if (targetProgram) {
      await pool.query(
        `
          UPDATE fitness_programs
          SET last_advice_text = $1,
              last_advice_at = NOW()
          WHERE id = $2 AND user_id = $3
        `,
        [advice, targetProgram.id, req.user.id]
      );
    }

    return res.json({
      advice,
      generatedAt: now.toISOString(),
      source,
      fallbackReason,
      reused: false,
      programId: targetProgram?.id || null,
    });
  } catch (error) {
    console.error("Daily advice error:", error.message);
    return res.status(500).json({ message: "Server error while generating advice" });
  }
});

module.exports = router;
