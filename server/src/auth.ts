import jwt from "jsonwebtoken";
import type { NextFunction, Request, RequestHandler, Response } from "express";

export function signToken(secret: string, username: string): string {
  return jwt.sign({ sub: username }, secret, { expiresIn: "7d" });
}

export function verifyToken(secret: string, token: string): boolean {
  try {
    jwt.verify(token, secret);
    return true;
  } catch {
    return false;
  }
}

export function requireAuth(secret: string): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    const header = req.header("Authorization") ?? "";
    const match = /^Bearer (.+)$/.exec(header);
    const token = match?.[1] ?? "";

    if (!token || !verifyToken(secret, token)) {
      res.status(401).json({ error: { code: "UNAUTHORIZED", message: "Missing or invalid authorization token" } });
      return;
    }
    next();
  };
}
