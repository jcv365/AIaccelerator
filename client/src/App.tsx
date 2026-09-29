import { useEffect, useState } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import OpportunityList from "./pages/OpportunityList";
import NewOpportunity from "./pages/NewOpportunity";
import OpportunityDetail from "./pages/OpportunityDetail";
import { getToken, login } from "./api";

function LoginForm({ onSuccess }: { onSuccess: () => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const ok = await login(username, password);
    if (ok) {
      onSuccess();
    } else {
      setError("Invalid username or password");
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
        <button type="submit">Log in</button>
      </form>
      {error && <p role="alert">{error}</p>}
    </main>
  );
}

function BackendStatus() {
  const [status, setStatus] = useState<"loading" | "ok" | "unreachable">("loading");

  useEffect(() => {
    fetch("/api/health")
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error("not ok"))))
      .then(() => setStatus("ok"))
      .catch(() => setStatus("unreachable"));
  }, []);

  return <footer>Backend status: {status}</footer>;
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
      <BackendStatus />
    </BrowserRouter>
  );
}
