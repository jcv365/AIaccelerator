import { useEffect, useState } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import OpportunityList from "./pages/OpportunityList";
import NewOpportunity from "./pages/NewOpportunity";
import OpportunityDetail from "./pages/OpportunityDetail";
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

function BackendStatus({ onLogout }: { onLogout: () => void }) {
  const [status, setStatus] = useState<"loading" | "ok" | "unreachable">("loading");

  useEffect(() => {
    fetch("/api/health")
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error("not ok"))))
      .then(() => setStatus("ok"))
      .catch(() => setStatus("unreachable"));
  }, []);

  function handleLogout() {
    clearToken();
    onLogout();
  }

  return (
    <footer>
      Backend status: {status} <button onClick={handleLogout}>Log out</button>
    </footer>
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
      <Routes>
        <Route path="/" element={<OpportunityList />} />
        <Route path="/opportunities/new" element={<NewOpportunity />} />
        <Route path="/opportunities/:id" element={<OpportunityDetail />} />
      </Routes>
      <BackendStatus onLogout={() => setHasToken(false)} />
    </BrowserRouter>
  );
}
