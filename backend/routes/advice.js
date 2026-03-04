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

function buildFallbackAdvice(name, programs) {
  const programCount = programs.length;
  return `Hi ${name}, free daily advice: Focus on form first, then progressive overload. You currently have ${programCount} active program(s). Today: warm up 10 minutes, complete your main lifts with controlled tempo, and finish with light mobility.`;
}

async function getRagContext(programs) {
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

function buildPrompt(name, programs, ragChunks) {
  const systemPrompt =
    process.env.ADVICE_SYSTEM_PROMPT ||
    "You are a concise, safety-first fitness coach. Keep advice practical, avoid medical diagnosis, and focus on training consistency.";

  const compactPrograms = programs.slice(0, 3).map((program) => ({
    title: program.title,
    workouts: Array.isArray(program.description)
      ? program.description.slice(0, 6).map((item) => ({
          name: item.name,
          repetitions: item.repetitions,
          weightKg: item.weightKg,
        }))
      : [],
  }));

  const ragText = ragChunks.length
    ? ragChunks.map((chunk, index) => `${index + 1}) ${chunk.title}: ${chunk.content}`).join("\n")
    : "No external context provided.";

  return `SYSTEM:\n${systemPrompt}\n\nUSER_CONTEXT:\n- Name: ${name}\n- Programs: ${JSON.stringify(compactPrograms)}\n\nRAG_CONTEXT:\n${ragText}\n\nTASK:\nGive one daily workout advice for today.\n\nOUTPUT_FORMAT:\n- One short paragraph (max 90 words)\n- Then 3 bullet points for action today\n- Include one brief safety note.`;
}

async function fetchCloudAdvice(name, programs, ragChunks) {
  const token = process.env.HF_API_TOKEN;
  if (!token) {
    return buildFallbackAdvice(name, programs);
  }

  const prompt = buildPrompt(name, programs, ragChunks);
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
              content: "You are a concise, safety-first fitness coach.",
            },
            {
              role: "user",
              content: prompt,
            },
          ],
          max_tokens: 220,
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
      "SELECT id, name, last_advice_at, last_advice_text FROM users WHERE id = $1",
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
      const ragChunks = await getRagContext(programsResult.rows);
      advice = await fetchCloudAdvice(user.name, programsResult.rows, ragChunks);
      source = process.env.HF_API_TOKEN ? "cloud" : "fallback";
    } catch (cloudError) {
      console.warn("HF advice fallback:", cloudError.message);
      advice = buildFallbackAdvice(user.name, programsResult.rows);
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
