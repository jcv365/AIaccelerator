import { timingSafeEqual } from "node:crypto";
import type { NextFunction, Request, RequestHandler, Response } from "express";

export function requireAccelApiKey(expectedKey: string): RequestHandler {
  const expectedBuf = Buffer.from(expectedKey);

  return (req: Request, res: Response, next: NextFunction): void => {
    const provided = req.header("X-API-Key") ?? "";
    const providedBuf = Buffer.from(provided);
    const isValid = providedBuf.length === expectedBuf.length && timingSafeEqual(expectedBuf, providedBuf);

    if (!isValid) {
      res.status(401).json({ error: { code: "UNAUTHORIZED", message: "Missing or invalid X-API-Key" } });
      return;
    }
    next();
  };
}
