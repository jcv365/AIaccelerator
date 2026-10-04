import type { ReactNode } from "react";
import "./ui.css";

export interface InlineAlertProps {
  variant?: "info" | "success" | "caution" | "error";
  children: ReactNode;
}

export function InlineAlert({ variant = "info", children }: InlineAlertProps) {
  return (
    <div className={`inline-alert inline-alert--${variant}`} role={variant === "error" ? "alert" : "status"}>
      {children}
    </div>
  );
}
