import { useEffect, useState } from "react";
import {
  addProgramWorkoutDate,
  bulkCreateWorkouts,
  createProgram,
  deleteProgramWorkoutDate,
  getDailyAdvice,
  getExampleAdvice,
  getProfile,
  getPrograms,
  getWorkouts,
  loginUser,
  registerUser,
  softDeleteProgram,
  updateEquipment,
  updateProgram,
} from "./api";

function SearchableWorkoutDropdown({
  workouts,
  searchQuery,
  setSearchQuery,
  onSelect,
  triggerLabel,
}) {
  const [isOpen, setIsOpen] = useState(false);

  const filteredWorkouts = workouts.filter((workout) => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) {
      return true;
    }

    return (
      workout.name.toLowerCase().includes(query) ||
      (workout.muscle_group || "").toLowerCase().includes(query)
    );
  });

  return (
    <div className="custom-dropdown">
      <button
        type="button"
        className="dropdown-trigger"
        onClick={() => setIsOpen((prev) => !prev)}
      >
        {triggerLabel}
      </button>

      {isOpen && (
        <div className="dropdown-menu">
          <input
            type="text"
            placeholder="Search workouts..."
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
          />

          <div className="dropdown-options">
            {filteredWorkouts.length === 0 ? (
              <p>No workouts found.</p>
            ) : (
              filteredWorkouts.map((workout) => (
                <button
                  key={workout.id}
                  type="button"
                  className="dropdown-option"
                  onClick={() => {
                    onSelect(workout.id);
                    setIsOpen(false);
                    setSearchQuery("");
                  }}
                >
                  {workout.name}
                  {workout.muscle_group ? ` (${workout.muscle_group})` : ""}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// Renders LLM markdown-style text into structured JSX
function AdviceRenderer({ text }) {
  if (!text) return null;

  // Inline: replace **bold** with <strong>
  function renderInline(line) {
    const parts = line.split(/(\*\*[^*]+\*\*)/g);
    return parts.map((part, i) =>
      part.startsWith("**") && part.endsWith("**")
        ? <strong key={i}>{part.slice(2, -2)}</strong>
        : part
    );
  }

  const lines = text.split("\n");
  const blocks = [];
  let bulletBuffer = [];

  function flushBullets() {
    if (bulletBuffer.length === 0) return;
    blocks.push(
      <ul key={`ul-${blocks.length}`} className="advice-list">
        {bulletBuffer.map((b, i) => (
          <li key={i}>{renderInline(b)}</li>
        ))}
      </ul>
    );
    bulletBuffer = [];
  }

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const trimmed = raw.trim();

    if (!trimmed) {
      flushBullets();
      continue;
    }

    // Bullet line
    if (/^[-•*]\s+/.test(trimmed)) {
      bulletBuffer.push(trimmed.replace(/^[-•*]\s+/, ""));
      continue;
    }

    // Numbered bullet  e.g. "1. ..."
    if (/^\d+\.\s+/.test(trimmed)) {
      bulletBuffer.push(trimmed.replace(/^\d+\.\s+/, ""));
      continue;
    }

    flushBullets();

    // Safety / Note line — special call-out
    if (/^(safety|⚠|note)[:\s]/i.test(trimmed) || /^\*\*(safety|note)/i.test(trimmed)) {
      const clean = trimmed.replace(/^\*\*(safety|note)[^*]*\*\*:?\s*/i, "").replace(/^(safety|note)[:\s]*/i, "");
      blocks.push(
        <div key={`safety-${i}`} className="advice-safety">
          <span className="advice-safety-icon">⚠</span>
          <span>{renderInline(clean || trimmed)}</span>
        </div>
      );
      continue;
    }

    // Markdown heading: ### or ## or # OR bold-only line like **Title**
    const headingMatch = trimmed.match(/^#{1,3}\s+(.+)$/);
    const boldOnlyLine = trimmed.match(/^\*\*(.+)\*\*:?$/);
    if (headingMatch) {
      flushBullets();
      blocks.push(<h4 key={`h-${i}`} className="advice-heading">{renderInline(headingMatch[1])}</h4>);
      continue;
    }
    if (boldOnlyLine) {
      flushBullets();
      blocks.push(<h4 key={`h-${i}`} className="advice-heading">{boldOnlyLine[1]}</h4>);
      continue;
    }

    // Regular paragraph
    blocks.push(<p key={`p-${i}`} className="advice-para">{renderInline(trimmed)}</p>);
  }

  flushBullets();

  return <div className="advice-body">{blocks}</div>;
}

function App() {
  const [currentPath, setCurrentPath] = useState(window.location.pathname);
  const isAdminPage = currentPath === "/admin/workouts";
  const isAboutPage = currentPath === "/about" || (currentPath === "/" && !localStorage.getItem("token"));
  const isLoginPage = currentPath === "/login";
  const detailsMatch = currentPath.match(/^\/programs\/(\d+)$/);
  const isProgramDetailsPage = Boolean(detailsMatch);
  const programDetailsId = detailsMatch ? Number(detailsMatch[1]) : null;

  const [isRegister, setIsRegister] = useState(false);
  const [authLoading, setAuthLoading] = useState(false);
  const [authWaitHint, setAuthWaitHint] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [token, setToken] = useState(localStorage.getItem("token") || "");
  const [userName, setUserName] = useState(localStorage.getItem("userName") || "");
  const [userRole, setUserRole] = useState(localStorage.getItem("userRole") || "user");
  const [programs, setPrograms] = useState([]);
  const [workouts, setWorkouts] = useState([]);
  const [createWorkoutSearch, setCreateWorkoutSearch] = useState("");
  const [editWorkoutSearch, setEditWorkoutSearch] = useState("");
  const [createCustomWorkoutText, setCreateCustomWorkoutText] = useState("");
  const [editCustomWorkoutText, setEditCustomWorkoutText] = useState("");
  const [isCreateCustomModalOpen, setIsCreateCustomModalOpen] = useState(false);
  const [isEditCustomModalOpen, setIsEditCustomModalOpen] = useState(false);
  const [programTitle, setProgramTitle] = useState("");
  const [programItems, setProgramItems] = useState([]);
  const [editingProgramId, setEditingProgramId] = useState(null);
  const [editTitle, setEditTitle] = useState("");
  const [editItems, setEditItems] = useState([]);
  const [bulkJson, setBulkJson] = useState(`[
  {"workout":"Bench Press","description":"barbell chest press","muscle_group":"Chest"},
  {"workout":"Incline Bench Press","description":"upper chest press","muscle_group":"Chest"},
  {"workout":"Decline Bench Press","description":"lower chest press","muscle_group":"Chest"}
]`);
  const [bulkResult, setBulkResult] = useState(null);
  const [manualWorkoutDate, setManualWorkoutDate] = useState("");
  const [dailyAdvice, setDailyAdvice] = useState("");
  const [adviceSource, setAdviceSource] = useState("");
  const [adviceFeedback, setAdviceFeedback] = useState("");
  const [userEquipment, setUserEquipment] = useState(localStorage.getItem("userEquipment") || "gym");
  const [isAddProgramOpen, setIsAddProgramOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [exampleAdvice, setExampleAdvice] = useState("");
  const [exampleAdviceLoading, setExampleAdviceLoading] = useState(false);
  const [exampleAdviceError, setExampleAdviceError] = useState("");

  useEffect(() => {
    const onPopState = () => {
      setCurrentPath(window.location.pathname);
    };

    window.addEventListener("popstate", onPopState);
    return () => {
      window.removeEventListener("popstate", onPopState);
    };
  }, []);

  useEffect(() => {
    if (token) {
      loadPrograms(token);
      loadWorkouts(token);
      loadProfile(token);
    }
  }, [token]);

  async function loadPrograms(currentToken) {
    try {
      const data = await getPrograms(currentToken);
      setPrograms(data.filter((program) => !program.deleted));
    } catch (err) {
      setError(err.message);
    }
  }

  async function loadWorkouts(currentToken) {
    try {
      const data = await getWorkouts(currentToken);
      setWorkouts(data);
    } catch (err) {
      setError(err.message);
    }
  }

  async function loadProfile(currentToken) {
    try {
      const profile = await getProfile(currentToken);
      const eq = profile.equipment || "gym";
      setUserEquipment(eq);
      localStorage.setItem("userEquipment", eq);
      if (profile.role) {
        setUserRole(profile.role);
        localStorage.setItem("userRole", profile.role);
      }
    } catch {
      // non-critical — silently ignore
    }
  }

  function normalizeProgramItems(items) {
    if (!Array.isArray(items)) {
      return [];
    }

    return items.map((item) => ({
      workoutId: item.workoutId || item.workout_id || null,
      name: item.name || item.workout || "",
      sets: Number.isInteger(Number(item.sets)) && Number(item.sets) > 0 ? Number(item.sets) : 1,
      repetitions: Number.isInteger(Number(item.repetitions)) ? Number(item.repetitions) : 0,
      weightKg: Number.isInteger(Number(item.weightKg)) ? Number(item.weightKg) : 0,
    }));
  }

  async function handleAuthSubmit(event) {
    event.preventDefault();
    setError("");
    setMessage("");
    setAuthWaitHint("pls wait, request is being processed, it can take several minutes");
    setAuthLoading(true);

    try {
      if (isRegister) {
        await registerUser({ name, email, password });
        setMessage("Registration successful. You can now login.");
        setIsRegister(false);
        setPassword("");
        return;
      }

      const data = await loginUser({ email, password });
      setToken(data.token);
      setUserName(data.user.name);
      setUserRole(data.user.role || "user");
      localStorage.setItem("token", data.token);
      localStorage.setItem("userName", data.user.name);
      localStorage.setItem("userRole", data.user.role || "user");
      setMessage("Login successful.");
    } catch (err) {
      setError(err.message);
    } finally {
      setAuthLoading(false);
      setAuthWaitHint("");
    }
  }

  async function handleAddProgram(event) {
    event.preventDefault();
    setError("");
    setMessage("");

    if (programItems.length === 0) {
      setError("Add at least one workout to the program");
      return;
    }

    try {
      const created = await createProgram(token, {
        title: programTitle,
        description: programItems,
      });

      setPrograms((prev) => [created, ...prev]);
      setProgramTitle("");
      setProgramItems([]);
      setCreateCustomWorkoutText("");
      setMessage("Program saved.");
    } catch (err) {
      setError(err.message);
    }
  }

  function handleAddWorkoutToProgram(workout) {
    setProgramItems((prev) => {
      if (prev.some((item) => item.workoutId === workout.id)) {
        return prev;
      }

      return [
        ...prev,
        {
          workoutId: workout.id,
          name: workout.name,
          sets: 1,
          repetitions: 0,
          weightKg: 0,
        },
      ];
    });
  }

  function handleAddCustomWorkoutToProgram() {
    const customName = createCustomWorkoutText.trim();
    if (!customName) {
      return;
    }

    setProgramItems((prev) => {
      if (prev.some((item) => item.name.toLowerCase() === customName.toLowerCase())) {
        return prev;
      }

      return [
        ...prev,
        {
          workoutId: null,
          name: customName,
          sets: 1,
          repetitions: 0,
          weightKg: 0,
        },
      ];
    });

    setCreateCustomWorkoutText("");
    setIsCreateCustomModalOpen(false);
  }

  function handleCreateWorkoutSelect(value) {
    if (!value) {
      return;
    }

    const selectedWorkout = workouts.find((workout) => workout.id === Number(value));
    if (!selectedWorkout) {
      return;
    }

    handleAddWorkoutToProgram(selectedWorkout);
  }

  function handleRemoveWorkoutFromProgram(itemIndex) {
    setProgramItems((prev) => prev.filter((_, index) => index !== itemIndex));
  }

  function handleProgramItemChange(itemIndex, field, value) {
    const parsedValue = Number.parseInt(value, 10);
    const safeValue = Number.isNaN(parsedValue) || parsedValue < 0 ? 0 : parsedValue;

    setProgramItems((prev) =>
      prev.map((item, index) => (index === itemIndex ? { ...item, [field]: safeValue } : item))
    );
  }

  function startEditing(program) {
    setEditingProgramId(program.id);
    setEditTitle(program.title);
    setEditItems(normalizeProgramItems(program.description));
    setMessage("");
    setError("");
  }

  function cancelEditing() {
    setEditingProgramId(null);
    setEditTitle("");
    setEditItems([]);
    setEditCustomWorkoutText("");
    setIsEditCustomModalOpen(false);
  }

  function handleAddWorkoutToEdit(workout) {
    setEditItems((prev) => {
      if (prev.some((item) => item.workoutId === workout.id)) {
        return prev;
      }

      return [
        ...prev,
        {
          workoutId: workout.id,
          name: workout.name,
          sets: 1,
          repetitions: 0,
          weightKg: 0,
        },
      ];
    });
  }

  function handleAddCustomWorkoutToEdit() {
    const customName = editCustomWorkoutText.trim();
    if (!customName) {
      return;
    }

    setEditItems((prev) => {
      if (prev.some((item) => item.name.toLowerCase() === customName.toLowerCase())) {
        return prev;
      }

      return [
        ...prev,
        {
          workoutId: null,
          name: customName,
          sets: 1,
          repetitions: 0,
          weightKg: 0,
        },
      ];
    });

    setEditCustomWorkoutText("");
    setIsEditCustomModalOpen(false);
  }

  function handleEditWorkoutSelect(value) {
    if (!value) {
      return;
    }

    const selectedWorkout = workouts.find((workout) => workout.id === Number(value));
    if (!selectedWorkout) {
      return;
    }

    handleAddWorkoutToEdit(selectedWorkout);
  }

  function handleRemoveWorkoutFromEdit(itemIndex) {
    setEditItems((prev) => prev.filter((_, index) => index !== itemIndex));
  }

  function handleEditItemChange(itemIndex, field, value) {
    const parsedValue = Number.parseInt(value, 10);
    const safeValue = Number.isNaN(parsedValue) || parsedValue < 0 ? 0 : parsedValue;

    setEditItems((prev) =>
      prev.map((item, index) => (index === itemIndex ? { ...item, [field]: safeValue } : item))
    );
  }

  async function handleSaveEdit(programId) {
    setError("");
    setMessage("");

    if (editItems.length === 0) {
      setError("Program must include at least one workout");
      return;
    }

    try {
      const updated = await updateProgram(token, programId, {
        title: editTitle,
        description: editItems,
      });

      setPrograms((prev) => prev.map((program) => (program.id === programId ? updated : program)));
      setMessage("Program updated.");
      cancelEditing();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleBulkImport(event) {
    event.preventDefault();
    setError("");
    setMessage("");
    setBulkResult(null);

    try {
      const parsed = JSON.parse(bulkJson);
      if (!Array.isArray(parsed)) {
        throw new Error("JSON must be an array of workout objects");
      }

      const result = await bulkCreateWorkouts(token, parsed);
      setBulkResult(result);
      setMessage(
        `Bulk import done. Inserted: ${result.insertedCount}, Skipped: ${result.skippedCount}`
      );
    } catch (err) {
      setError(err.message || "Invalid JSON payload");
    }
  }

  async function handleSoftDeleteProgram(programId) {
    setError("");
    setMessage("");

    const isConfirmed = window.confirm("Are you sure you want to delete this program?");
    if (!isConfirmed) {
      return;
    }

    try {
      await softDeleteProgram(token, programId);
      setPrograms((prev) => prev.filter((program) => program.id !== programId));
      setMessage("Program deleted (soft delete).");
      if (editingProgramId === programId) {
        cancelEditing();
      }
      if (programDetailsId === programId) {
        navigateTo("/");
      }
    } catch (err) {
      setError(err.message);
    }
  }

  const [adviceLoading, setAdviceLoading] = useState(false);

  async function handleGetExampleAdvice() {
    setExampleAdviceLoading(true);
    setExampleAdviceError("");
    try {
      const result = await getExampleAdvice();
      setExampleAdvice(result.advice || "");
    } catch (err) {
      setExampleAdviceError(err.message || "Could not load recommendation. Please try again.");
    } finally {
      setExampleAdviceLoading(false);
    }
  }

  async function handleGetDailyAdvice() {
    setError("");
    setMessage("");
    setAdviceFeedback("");
    setAdviceLoading(true);

    try {
      const result = await getDailyAdvice(token);
      setDailyAdvice(result.advice || "No advice returned");
      setAdviceSource(result.source || "unknown");
    } catch (err) {
      if (err.status === 429 || (err.message && (err.message.includes("daily advice") || err.message.includes("already received")))) {
        setAdviceFeedback("You've used all your free advice for today. Come back tomorrow!");
      } else {
        setError(err.message);
      }
    } finally {
      setAdviceLoading(false);
    }
  }

  async function handleAddWorkoutDate(programId, dateValue) {
    setError("");
    setMessage("");

    try {
      const updated = await addProgramWorkoutDate(token, programId, dateValue);
      setPrograms((prev) => prev.map((program) => (program.id === programId ? updated : program)));
      setMessage("Workout date recorded.");
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleDeleteWorkoutDate(programId, dateValue) {
    setError("");
    setMessage("");

    try {
      const updated = await deleteProgramWorkoutDate(token, programId, dateValue);
      setPrograms((prev) => prev.map((program) => (program.id === programId ? updated : program)));
      setMessage("Workout date removed.");
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleEquipmentChange(newEquipment) {
    setUserEquipment(newEquipment);
    localStorage.setItem("userEquipment", newEquipment);
    try {
      await updateEquipment(token, newEquipment);
      setMessage(`Equipment updated to "${newEquipment}".`);
    } catch (err) {
      setError(err.message);
    }
  }

  function formatDateTime(dateValue) {
    const parsed = new Date(dateValue);
    if (Number.isNaN(parsed.getTime())) {
      return dateValue;
    }

    return parsed.toLocaleString();
  }

  function navigateTo(path) {
    if (window.location.pathname === path) {
      return;
    }

    window.history.pushState({}, "", path);
    setCurrentPath(path);
  }

  function handleLogout() {
    setToken("");
    setUserName("");
    setUserRole("user");
    setPrograms([]);
    localStorage.removeItem("token");
    localStorage.removeItem("userName");
    localStorage.removeItem("userRole");
    navigateTo("/about");
  }

  const selectedProgram = isProgramDetailsPage
    ? programs.find((program) => program.id === programDetailsId)
    : null;

  return (
    <>
      {/* ── Top navigation bar ─────────────────────────────────── */}
      <header className="topbar">
        <button type="button" className="topbar-brand" onClick={() => navigateTo("/about")}>Fitness Tracker</button>

        <nav className="topbar-nav">
          {token ? (
            <>
              <button
                type="button"
                className={`topbar-nav-btn${!isAdminPage && !isProgramDetailsPage && !isAboutPage ? " active" : ""}`}
                onClick={() => navigateTo("/")}
              >
                Dashboard
              </button>
              {userRole === "admin" && (
                <button
                  type="button"
                  className={`topbar-nav-btn${isAdminPage ? " active" : ""}`}
                  onClick={() => navigateTo("/admin/workouts")}
                >
                  Admin
                </button>
              )}
            </>
          ) : (
            <button
              type="button"
              className={`topbar-nav-btn${isLoginPage ? " active" : ""}`}
              onClick={() => navigateTo("/login")}
            >
              Login
            </button>
          )}
          <button
            type="button"
            className={`topbar-nav-btn${isAboutPage ? " active" : ""}`}
            onClick={() => navigateTo("/about")}
          >
            About
          </button>
        </nav>

        {token && (
          <div className="topbar-right">
            <span className="topbar-user">👤 {userName}</span>
            <button type="button" className="topbar-logout" onClick={handleLogout}>
              Logout
            </button>
          </div>
        )}
      </header>

      <div className="container">
        {isAboutPage ? (
          <>
          <div className="card info-card">
            <p className="info-hero">💪</p>
            <h1 className="info-title">Fitness Tracker</h1>
            <p className="info-description">
              A simple but powerful fitness tracker that helps you build and manage your workout
              programs. Log your sessions, track your history, and get{" "}
              <strong>personalized AI recommendations</strong> tailored to your equipment.
            </p>
            <ul className="info-features">
              <li>📋 Create and manage custom workout programs</li>
              <li>📅 Log every session and track your history</li>
              <li>🤖 Get daily AI-powered workout advice</li>
              <li>🏋️ Works for gym, home, or bodyweight training</li>
            </ul>
            <button
              type="button"
              className="info-cta"
              onClick={() => {
                setIsRegister(true);
                navigateTo("/login");
              }}
            >
              I want to try it →
            </button>
          </div>

          <div className="info-example">
            <h2 className="info-example-heading">See it in action</h2>
            <p className="info-example-sub">Here's an example home dumbbell program and what the AI recommends for it.</p>

            <div className="example-program-card">
              <div className="example-program-header">
                <strong>Home Dumbbell Full Body</strong>
                <span className="example-equipment-badge">Home Equipment: Dumbbells</span>
              </div>
              <ul className="example-exercises">
                <li>Floor Dumbbell Press — 3 × 10</li>
                <li>Dumbbell Row — 3 × 10</li>
                <li>Shoulder Press — 3 × 12</li>
                <li>Dumbbell Concentration Curls — 3 × 12</li>
                <li>Overhead Triceps Extension — 3 × 12</li>
                <li>Squats — 4 × 15</li>
                <li>Calf Raises — 3 × 20</li>
              </ul>
            </div>

            {!exampleAdvice && (
              <>
                <p className="about-hint">⏳ The first request may take a couple of minutes. The website works on render. This might happen when it stays idle for a while..</p>
                <button
                  type="button"
                  className="info-example-btn"
                  onClick={handleGetExampleAdvice}
                  disabled={exampleAdviceLoading}
                >
                  {exampleAdviceLoading ? "Fetching recommendation…" : "Get example AI recommendation"}
                </button>
              </>
            )}

            {exampleAdviceError && <p className="error">{exampleAdviceError}</p>}

            {exampleAdvice && (
              <div className="example-advice-result">
                <h3 className="example-advice-title">AI Recommendation</h3>
                <AdviceRenderer text={exampleAdvice} />
              </div>
            )}
          </div>
          </>
        ) : isLoginPage && !token ? (
          <div className="card auth-card">
            <h2>{isRegister ? "Register" : "Login"}</h2>
            <form onSubmit={handleAuthSubmit}>
            {isRegister && (
              <input
                type="text"
                placeholder="Name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                required
              />
            )}

            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />

            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />

            <button type="submit" disabled={authLoading}>
              {authLoading
                ? isRegister
                  ? "Creating account..."
                  : "Logging in..."
                : isRegister
                  ? "Create account"
                  : "Login"}
            </button>
            {authWaitHint && <p className="auth-wait-hint">{authWaitHint}</p>}
          </form>

          <button
            className="secondary"
            type="button"
            disabled={authLoading}
            onClick={() => {
              setIsRegister((prev) => !prev);
              setMessage("");
              setError("");
              setAuthWaitHint("");
            }}
          >
            {isRegister ? "Already have an account? Login" : "No account? Register"}
          </button>
          <p className="auth-meta-hint">No email activation needed, throwaway emails can be used.</p>
        </div>
      ) : (
        <>
          {isProgramDetailsPage ? (
            <div className="card">
              <div className="details-header">
                <h2>Program details</h2>
                <button type="button" className="secondary" onClick={() => navigateTo("/")}>
                  Back
                </button>
              </div>

              {!selectedProgram ? (
                <p>Program not found.</p>
              ) : (
                <>
                  <p>
                    <strong>Title:</strong> {selectedProgram.title}
                  </p>
                  <p>
                    <strong>Created:</strong>{" "}
                    {new Date(selectedProgram.created_at).toLocaleString()}
                  </p>
                  <div className="detail-list">
                    {normalizeProgramItems(selectedProgram.description).map((item, index) => (
                      <div className="detail-item" key={`${selectedProgram.id}-${index}`}>
                        <p>
                          <strong>Workout:</strong> {item.name}
                        </p>
                        <p>
                          <strong>Sets:</strong> {item.sets ?? 1}
                        </p>
                        <p>
                          <strong>Reps:</strong> {item.repetitions}
                        </p>
                        <p>
                          <strong>Weight:</strong> {item.weightKg} kg
                        </p>
                      </div>
                    ))}
                  </div>

                  <div className="date-tracking">
                    <h3>Workout dates</h3>
                    <div className="actions">
                      <button
                        type="button"
                        onClick={() => handleAddWorkoutDate(selectedProgram.id, new Date().toISOString())}
                      >
                        I worked out today
                      </button>
                    </div>

                    <div className="manual-date-row">
                      <input
                        type="datetime-local"
                        value={manualWorkoutDate}
                        onChange={(event) => setManualWorkoutDate(event.target.value)}
                      />
                      <button
                        type="button"
                        className="secondary"
                        onClick={() => {
                          if (!manualWorkoutDate) {
                            return;
                          }

                          const asIso = new Date(manualWorkoutDate).toISOString();
                          handleAddWorkoutDate(selectedProgram.id, asIso);
                          setManualWorkoutDate("");
                        }}
                      >
                        Add date
                      </button>
                    </div>

                    <ul className="date-list">
                      {(Array.isArray(selectedProgram.workout_dates)
                        ? [...selectedProgram.workout_dates].sort((a, b) => b.localeCompare(a))
                        : []
                      ).map((dateValue) => (
                        <li key={dateValue}>
                          <span>{formatDateTime(dateValue)}</span>
                          <button
                            type="button"
                            className="danger"
                            onClick={() => handleDeleteWorkoutDate(selectedProgram.id, dateValue)}
                          >
                            Delete
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                </>
              )}
            </div>
          ) : isAdminPage && userRole !== "admin" ? (
            <div className="card">
              <p>You do not have permission to view this page.</p>
            </div>
          ) : isAdminPage ? (
            <div className="card">
              <h2>Admin Panel - Bulk Add Workouts</h2>
              <form onSubmit={handleBulkImport}>
                <textarea
                  className="bulk-input"
                  value={bulkJson}
                  onChange={(event) => setBulkJson(event.target.value)}
                />
                <button type="submit">Import workouts in bulk</button>
              </form>

              {bulkResult && (
                <div className="bulk-result">
                  <p>Total: {bulkResult.total}</p>
                  <p>Inserted: {bulkResult.insertedCount}</p>
                  <p>Skipped: {bulkResult.skippedCount}</p>
                </div>
              )}
            </div>
          ) : (
            <>
              <div className="card">
                <div className="programs-header">
                  <h2>Your programs</h2>
                  <button
                    type="button"
                    className={isAddProgramOpen ? "secondary" : ""}
                    onClick={() => {
                      setIsAddProgramOpen((prev) => !prev);
                      if (isAddProgramOpen) {
                        setProgramItems([]);
                        setProgramTitle("");
                      }
                    }}
                  >
                    {isAddProgramOpen ? "Cancel" : "+ New program"}
                  </button>
                </div>

                {isAddProgramOpen && (
                  <form onSubmit={(e) => { handleAddProgram(e); setIsAddProgramOpen(false); }} className="add-program-form">
                    <input
                      type="text"
                      placeholder="Program title"
                      value={programTitle}
                      onChange={(event) => setProgramTitle(event.target.value)}
                      required
                    />
                    <div className="dropdown-panel">
                      <p className="field-hint">Workout selector</p>
                      <div className="selector-actions">
                        <SearchableWorkoutDropdown
                          workouts={workouts}
                          searchQuery={createWorkoutSearch}
                          setSearchQuery={setCreateWorkoutSearch}
                          onSelect={handleCreateWorkoutSelect}
                          triggerLabel="Select workout"
                        />
                        <button
                          type="button"
                          className="secondary"
                          onClick={() => setIsCreateCustomModalOpen(true)}
                        >
                          Add custom
                        </button>
                      </div>
                    </div>

                    <div className="program-items">
                      {programItems.map((item, itemIndex) => (
                        <div
                          className="program-item"
                          key={`${item.workoutId ?? "custom"}-${item.name}-${itemIndex}`}
                        >
                          <strong>{item.name}</strong>
                          <div className="numbers-row">
                            <label>
                              <span className="field-hint">Sets</span>
                              <input
                                type="number"
                                min="1"
                                value={item.sets ?? 1}
                                onChange={(event) =>
                                  handleProgramItemChange(itemIndex, "sets", event.target.value)
                                }
                                placeholder="e.g. 3"
                              />
                            </label>
                            <label>
                              <span className="field-hint">Reps</span>
                              <input
                                type="number"
                                min="0"
                                value={item.repetitions}
                                onChange={(event) =>
                                  handleProgramItemChange(
                                    itemIndex,
                                    "repetitions",
                                    event.target.value
                                  )
                                }
                                placeholder="e.g. 10"
                              />
                            </label>
                            <label>
                              <span className="field-hint">Weight (kg)</span>
                              <input
                                type="number"
                                min="0"
                                value={item.weightKg}
                                onChange={(event) =>
                                  handleProgramItemChange(itemIndex, "weightKg", event.target.value)
                                }
                                placeholder="e.g. 60"
                              />
                            </label>
                          </div>
                          <button
                            type="button"
                            className="secondary"
                            onClick={() => handleRemoveWorkoutFromProgram(itemIndex)}
                          >
                            Remove
                          </button>
                        </div>
                      ))}
                    </div>
                    <button type="submit">Save program</button>
                  </form>
                )}

                {programs.length === 0 && !isAddProgramOpen ? (
                  <p>No programs yet. Click "+ New program" to get started.</p>
                ) : (
                  <ul>
                    {programs.map((program) => (
                      <li key={program.id}>
                        {editingProgramId === program.id ? (
                          <div className="program-edit">
                            <input
                              type="text"
                              value={editTitle}
                              onChange={(event) => setEditTitle(event.target.value)}
                              required
                            />
                            <div className="dropdown-panel">
                              <p className="field-hint">Workout selector</p>
                              <div className="selector-actions">
                                <SearchableWorkoutDropdown
                                  workouts={workouts}
                                  searchQuery={editWorkoutSearch}
                                  setSearchQuery={setEditWorkoutSearch}
                                  onSelect={handleEditWorkoutSelect}
                                  triggerLabel="Select workout"
                                />
                                <button
                                  type="button"
                                  className="secondary"
                                  onClick={() => setIsEditCustomModalOpen(true)}
                                >
                                  Add custom
                                </button>
                              </div>
                            </div>

                            <div className="program-items">
                              {editItems.map((item, itemIndex) => (
                                <div
                                  className="program-item"
                                  key={`${item.workoutId ?? "custom"}-${item.name}-${itemIndex}`}
                                >
                                  <strong>{item.name}</strong>
                                  <div className="numbers-row">
                                    <label>
                                      <span className="field-hint">Sets</span>
                                      <input
                                        type="number"
                                        min="1"
                                        value={item.sets ?? 1}
                                        onChange={(event) =>
                                          handleEditItemChange(itemIndex, "sets", event.target.value)
                                        }
                                        placeholder="e.g. 3"
                                      />
                                    </label>
                                    <label>
                                      <span className="field-hint">Reps</span>
                                      <input
                                        type="number"
                                        min="0"
                                        value={item.repetitions}
                                        onChange={(event) =>
                                          handleEditItemChange(
                                            itemIndex,
                                            "repetitions",
                                            event.target.value
                                          )
                                        }
                                        placeholder="e.g. 10"
                                      />
                                    </label>
                                    <label>
                                      <span className="field-hint">Weight (kg)</span>
                                      <input
                                        type="number"
                                        min="0"
                                        value={item.weightKg}
                                        onChange={(event) =>
                                          handleEditItemChange(
                                            itemIndex,
                                            "weightKg",
                                            event.target.value
                                          )
                                        }
                                        placeholder="e.g. 60"
                                      />
                                    </label>
                                  </div>
                                  <button
                                    type="button"
                                    className="secondary"
                                    onClick={() => handleRemoveWorkoutFromEdit(itemIndex)}
                                  >
                                    Remove
                                  </button>
                                </div>
                              ))}
                            </div>
                            <div className="actions">
                              <button type="button" onClick={() => handleSaveEdit(program.id)}>
                                Save changes
                              </button>
                              <button type="button" className="secondary" onClick={cancelEditing}>
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          <>
                            <div className="program-header-row">
                              <strong>{program.title}</strong>
                              {program.deleted && <span className="deleted-badge">Deleted</span>}
                            </div>
                            <ul className="program-readonly-items">
                              {normalizeProgramItems(program.description).map((item, index) => (
                                <li key={`${program.id}-${item.workoutId || item.name}-${index}`}>
                                  {item.name} — {item.sets ?? 1}×{item.repetitions} reps @ {item.weightKg} kg
                                </li>
                              ))}
                            </ul>
                            <div className="actions">
                              <button
                                type="button"
                                className="secondary"
                                onClick={() => navigateTo(`/programs/${program.id}`)}
                              >
                                Details
                              </button>
                              <button
                                type="button"
                                onClick={() => startEditing(program)}
                                disabled={program.deleted}
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                className="danger"
                                onClick={() => handleSoftDeleteProgram(program.id)}
                                disabled={program.deleted}
                              >
                                Delete
                              </button>
                            </div>
                          </>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </>
          )}

          {!isAdminPage && (
            <div className="card advice-card">
              <div className="advice-box">
                <div className="equipment-selector">
                  <label htmlFor="equipment-select"><strong>My equipment:</strong></label>
                  <select
                    id="equipment-select"
                    value={userEquipment}
                    onChange={(e) => handleEquipmentChange(e.target.value)}
                  >
                    <option value="gym">Gym (full equipment)</option>
                    <option value="dumbbells">Home (dumbbells only)</option>
                    <option value="no equipment">No equipment (bodyweight)</option>
                  </select>
                </div>
                <button type="button" onClick={handleGetDailyAdvice} disabled={adviceLoading}>
                  {adviceLoading ? "Generating advice…" : "Get free daily workout advice"}
                </button>
                {adviceFeedback && <p>{adviceFeedback}</p>}
                {dailyAdvice && (
                  <div className="advice-result">
                    <h3 className="advice-result-title">Your Daily Advice</h3>
                    <AdviceRenderer text={dailyAdvice} />
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      )}

      {message && <p className="message">{message}</p>}
      {error && <p className="error">{error}</p>}

      {isCreateCustomModalOpen && (
        <div className="modal-overlay">
          <div className="modal-card">
            <h3>Add custom workout</h3>
            <textarea
              placeholder="Write custom workout name"
              value={createCustomWorkoutText}
              onChange={(event) => setCreateCustomWorkoutText(event.target.value)}
            />
            <div className="modal-actions">
              <button type="button" onClick={handleAddCustomWorkoutToProgram}>
                Add
              </button>
              <button
                type="button"
                className="secondary"
                onClick={() => {
                  setIsCreateCustomModalOpen(false);
                  setCreateCustomWorkoutText("");
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {isEditCustomModalOpen && (
        <div className="modal-overlay">
          <div className="modal-card">
            <h3>Add custom workout</h3>
            <textarea
              placeholder="Write custom workout name"
              value={editCustomWorkoutText}
              onChange={(event) => setEditCustomWorkoutText(event.target.value)}
            />
            <div className="modal-actions">
              <button type="button" onClick={handleAddCustomWorkoutToEdit}>
                Add
              </button>
              <button
                type="button"
                className="secondary"
                onClick={() => {
                  setIsEditCustomModalOpen(false);
                  setEditCustomWorkoutText("");
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
    </>
  );
}

export default App;
