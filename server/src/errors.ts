import type { NextFunction, Request, Response } from "express";
import { randomUUID } from "node:crypto";
import { logJson } from "./logger.js";

export function requestIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  const id = randomUUID();
  res.setHeader("X-Request-Id", id);
  (req as Request & { id: string }).id = id;
  next();
}

export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction
): void {
  const message = err instanceof Error ? err.message : "Unknown error";
  logJson("error", "unhandled error", {
    requestId: (req as Request & { id?: string }).id,
    path: req.path,
    message,
  });
  res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Internal server error" } });
}
