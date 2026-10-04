import { useEffect, useState } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Dashboard from "./pages/app/Dashboard";
import Portfolio from "./pages/Portfolio";
import NewOpportunity from "./pages/NewOpportunity";
import OpportunityDetail from "./pages/OpportunityDetail";
import ExperimentDetail from "./pages/ExperimentDetail";
import StartAnalysis from "./pages/StartAnalysis";
import { AppShell } from "./components/app/AppShell";
import { getToken, clearToken, login } from "./api";

function LoginForm({ onSuccess }: { onSuccess: () => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const ok = await login(username, password);
    setLoading(false);
    if (ok) {
      onSuccess();
    } else {
      setError("Invalid username or password, or the server is unreachable");
    }
  }

  return (
    <main>
      <h1>AI Accelerator</h1>
      <form onSubmit={handleSubmit}>
        <label>
          Username
          <input value={username} onChange={(e) => setUsername(e.target.value)} required />
        </label>
        <label>
          Password
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </label>
        <button type="submit" disabled={loading}>
          {loading ? "Logging in..." : "Log in"}
        </button>
      </form>
      {error && <p role="alert">{error}</p>}
    </main>
  );
}

export default function App() {
  const [hasToken, setHasToken] = useState(() => getToken() !== null);

  useEffect(() => {
    const interval = setInterval(() => {
      const present = getToken() !== null;
      setHasToken((prev) => (prev !== present ? present : prev));
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  if (!hasToken) {
    return <LoginForm onSuccess={() => setHasToken(true)} />;
  }

  return (
    <BrowserRouter>
      <AppShell
        onLogout={() => {
          clearToken();
          setHasToken(false);
        }}
      >
        <Routes>
          {/* "/" has no built site surface routed here yet (SITE-01/02 exist in
              SCREENS.md but aren't wired into this router pass) — once
              authenticated, landing on "/" still reaches the app rather than
              rendering nothing. */}
          <Route path="/" element={<Navigate to="/app" replace />} />
          <Route path="/app" element={<Dashboard />} />
          <Route path="/app/portfolio" element={<Portfolio />} />
          <Route path="/app/analyze" element={<StartAnalysis />} />
          <Route path="/app/opportunities/new" element={<NewOpportunity />} />
          <Route path="/app/opportunities/:id" element={<OpportunityDetail />} />
          <Route path="/app/opportunities/:id/experiments/:experimentId" element={<ExperimentDetail />} />
          <Route path="*" element={<Navigate to="/app" replace />} />
        </Routes>
      </AppShell>
    </BrowserRouter>
  );
}
