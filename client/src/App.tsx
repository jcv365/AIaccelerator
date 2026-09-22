import { useEffect, useState } from "react";

type Status = "loading" | "ok" | "unreachable";

export default function App() {
  const [status, setStatus] = useState<Status>("loading");

  useEffect(() => {
    fetch("/api/health")
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error("not ok"))))
      .then(() => setStatus("ok"))
      .catch(() => setStatus("unreachable"));
  }, []);

  return (
    <main>
      <h1>AI Accelerator</h1>
      <p>Backend status: {status}</p>
    </main>
  );
}
