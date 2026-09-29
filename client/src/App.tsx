import { useEffect, useState } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import OpportunityList from "./pages/OpportunityList";
import NewOpportunity from "./pages/NewOpportunity";
import OpportunityDetail from "./pages/OpportunityDetail";
import { getApiKey, setApiKey } from "./api";

function ApiKeyPrompt({ onSubmit }: { onSubmit: (key: string) => void }) {
  const [key, setKey] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (key.trim() === "") return;
    setApiKey(key.trim());
    onSubmit(key.trim());
  }

  return (
    <main>
      <h1>AI Accelerator</h1>
      <form onSubmit={handleSubmit}>
        <label>
          API Key
          <input
            type="password"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            required
          />
        </label>
        <button type="submit">Continue</button>
      </form>
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
  const [hasKey, setHasKey] = useState(() => getApiKey() !== null);

  // Poll for the key being cleared (e.g. by a 401 response elsewhere in the
  // app, via apiFetch's clearApiKey() call) so the prompt reappears without
  // requiring a full page reload.
  useEffect(() => {
    const interval = setInterval(() => {
      const present = getApiKey() !== null;
      setHasKey((prev) => (prev !== present ? present : prev));
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  if (!hasKey) {
    return <ApiKeyPrompt onSubmit={() => setHasKey(true)} />;
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
