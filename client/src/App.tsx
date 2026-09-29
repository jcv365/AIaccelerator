import { useEffect, useState } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import OpportunityList from "./pages/OpportunityList";
import NewOpportunity from "./pages/NewOpportunity";
import OpportunityDetail from "./pages/OpportunityDetail";

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
