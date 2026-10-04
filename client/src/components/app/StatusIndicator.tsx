import { useEffect, useState } from "react";
import { Button } from "../ui";
import "./app.css";

export interface StatusIndicatorProps {
  onLogout: () => void;
}

type BackendStatus = "loading" | "ok" | "unreachable";

export function StatusIndicator({ onLogout }: StatusIndicatorProps) {
  const [status, setStatus] = useState<BackendStatus>("loading");

  useEffect(() => {
    fetch("/api/health")
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error("not ok"))))
      .then(() => setStatus("ok"))
      .catch(() => setStatus("unreachable"));
  }, []);

  const label = status === "ok" ? "Backend online" : status === "unreachable" ? "Backend unreachable" : "Checking backend…";

  return (
    <div className="status-indicator">
      <span className="status-indicator__label">
        <span className={`status-indicator__dot status-indicator__dot--${status}`} aria-hidden="true" />
        {label}
      </span>
      <Button onClick={onLogout}>Log out</Button>
    </div>
  );
}
