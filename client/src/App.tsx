import { useEffect, useState } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Dashboard from "./pages/app/Dashboard";
import Portfolio from "./pages/Portfolio";
import NewOpportunity from "./pages/NewOpportunity";
import OpportunityDetail from "./pages/OpportunityDetail";
import ExperimentDetail from "./pages/ExperimentDetail";
import StartAnalysis from "./pages/StartAnalysis";
import EvidenceExplorer from "./pages/app/EvidenceExplorer";
import HypothesisEngine from "./pages/app/HypothesisEngine";
import PovPipeline from "./pages/app/PovPipeline";
import NoAiOpportunities from "./pages/app/NoAiOpportunities";
import ReportsAndExports from "./pages/app/ReportsAndExports";
import SystemHealth from "./pages/admin/SystemHealth";
import Landing from "./pages/site/Landing";
import SignIn from "./pages/site/SignIn";
import { AppShell } from "./components/app/AppShell";
import { getToken, clearToken } from "./api";

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
    return (
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/sign-in" element={<SignIn onSuccess={() => setHasToken(true)} />} />
          <Route path="*" element={<Navigate to="/sign-in" replace />} />
        </Routes>
      </BrowserRouter>
    );
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
          {/* Once authenticated, "/" and "/sign-in" lead straight into the app. */}
          <Route path="/" element={<Navigate to="/app" replace />} />
          <Route path="/sign-in" element={<Navigate to="/app" replace />} />
          <Route path="/app" element={<Dashboard />} />
          <Route path="/app/portfolio" element={<Portfolio />} />
          <Route path="/app/analyze" element={<StartAnalysis />} />
          <Route path="/app/evidence" element={<EvidenceExplorer />} />
          <Route path="/app/hypothesis" element={<HypothesisEngine />} />
          <Route path="/app/pov" element={<PovPipeline />} />
          <Route path="/app/no-ai" element={<NoAiOpportunities />} />
          <Route path="/app/reports" element={<ReportsAndExports />} />
          <Route path="/app/opportunities/new" element={<NewOpportunity />} />
          <Route path="/app/opportunities/:id" element={<OpportunityDetail />} />
          <Route path="/app/opportunities/:id/experiments/:experimentId" element={<ExperimentDetail />} />
          <Route
            path="/admin/health"
            element={
              <div data-surface="admin">
                <SystemHealth />
              </div>
            }
          />
          <Route path="*" element={<Navigate to="/app" replace />} />
        </Routes>
      </AppShell>
    </BrowserRouter>
  );
}
