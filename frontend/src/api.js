const API_BASE_URL = import.meta.env.VITE_API_URL || "https://fitness-tracker-gbon.onrender.com";

async function parseResponse(response) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.message || "Request failed");
  }
  return data;
}

export async function registerUser(payload) {
  const response = await fetch(`${API_BASE_URL}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  return parseResponse(response);
}

export async function loginUser(payload) {
  const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  return parseResponse(response);
}

export async function getPrograms(token) {
  const response = await fetch(`${API_BASE_URL}/api/programs`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  return parseResponse(response);
}

export async function createProgram(token, payload) {
  const response = await fetch(`${API_BASE_URL}/api/programs`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });

  return parseResponse(response);
}

export async function getWorkouts(token) {
  const response = await fetch(`${API_BASE_URL}/api/workouts`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  return parseResponse(response);
}

export async function updateProgram(token, programId, payload) {
  const response = await fetch(`${API_BASE_URL}/api/programs/${programId}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });

  return parseResponse(response);
}

export async function softDeleteProgram(token, programId) {
  const response = await fetch(`${API_BASE_URL}/api/programs/${programId}`, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  return parseResponse(response);
}

export async function addProgramWorkoutDate(token, programId, date) {
  const response = await fetch(`${API_BASE_URL}/api/programs/${programId}/workout-dates`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ date }),
  });

  return parseResponse(response);
}

export async function deleteProgramWorkoutDate(token, programId, date) {
  const response = await fetch(`${API_BASE_URL}/api/programs/${programId}/workout-dates`, {
    method: "DELETE",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ date }),
  });

  return parseResponse(response);
}

export async function getDailyAdvice(token) {
  const response = await fetch(`${API_BASE_URL}/api/advice/daily`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  return parseResponse(response);
}

export async function getProfile(token) {
  const response = await fetch(`${API_BASE_URL}/api/users/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  return parseResponse(response);
}

export async function updateEquipment(token, equipment) {
  const response = await fetch(`${API_BASE_URL}/api/users/me/equipment`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ equipment }),
  });

  return parseResponse(response);
}

export async function updateBodyMetrics(token, { height_cm, weight_kg, body_fat_pct }) {
  const response = await fetch(`${API_BASE_URL}/api/users/me/metrics`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ height_cm, weight_kg, body_fat_pct }),
  });

  return parseResponse(response);
}

export async function getExampleAdvice() {
  const response = await fetch(`${API_BASE_URL}/api/advice/example`);
  return parseResponse(response);
}

export async function trackVisit() {
  try {
    const response = await fetch(`${API_BASE_URL}/api/tracking/visit`, {
      method: "POST",
    });
    return parseResponse(response);
  } catch {
    return null;
  }
}

export async function trackExampleAdviceClick(visitId) {
  try {
    const response = await fetch(`${API_BASE_URL}/api/tracking/example-advice-click`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ visitId }),
    });
    return parseResponse(response);
  } catch {
    return null;
  }
}

export async function bulkCreateWorkouts(token, payload) {
  const response = await fetch(`${API_BASE_URL}/api/workouts/bulk`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });

  return parseResponse(response);
}

export async function getStreaks(token) {
  const response = await fetch(`${API_BASE_URL}/api/stats/streaks`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  return parseResponse(response);
}

export async function getPersonalRecords(token) {
  const response = await fetch(`${API_BASE_URL}/api/stats/personal-records`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  return parseResponse(response);
}

export async function savePersonalRecord(token, { exercise_name, weight_kg, reps }) {
  const response = await fetch(`${API_BASE_URL}/api/stats/personal-records`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ exercise_name, weight_kg, reps }),
  });

  return parseResponse(response);
}

export async function deletePersonalRecord(token, recordId) {
  const response = await fetch(`${API_BASE_URL}/api/stats/personal-records/${recordId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });

  return parseResponse(response);
}

export async function getBodyMetricsLog(token) {
  const response = await fetch(`${API_BASE_URL}/api/stats/body-metrics-log`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  return parseResponse(response);
}

export async function saveBodyMetricsEntry(token, { weight_kg, body_fat_pct, note }) {
  const response = await fetch(`${API_BASE_URL}/api/stats/body-metrics-log`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ weight_kg, body_fat_pct, note }),
  });

  return parseResponse(response);
}

export async function deleteBodyMetricsEntry(token, entryId) {
  const response = await fetch(`${API_BASE_URL}/api/stats/body-metrics-log/${entryId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });

  return parseResponse(response);
}
