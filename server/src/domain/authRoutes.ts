import { timingSafeEqual } from "node:crypto";
import { Router } from "express";
import bcrypt from "bcryptjs";
import { asyncHandler } from "../asyncHandler.js";
import { signToken } from "../auth.js";

export interface AuthRouterConfig {
  adminUsername: string;
  adminPasswordHash: string;
  authTokenSecret: string;
}

function constantTimeEqual(a: string, b: string): boolean {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  return aBuf.length === bBuf.length && timingSafeEqual(aBuf, bBuf);
}

export function createAuthRouter(config: AuthRouterConfig): Router {
  const router = Router();

  router.post(
    "/login",
    asyncHandler(async (req, res) => {
      const body = (req.body ?? {}) as { username?: unknown; password?: unknown };
      const { username, password } = body;

      if (typeof username !== "string" || typeof password !== "string") {
        res.status(401).json({ error: { code: "UNAUTHORIZED", message: "Invalid credentials" } });
        return;
      }

      const usernameOk = constantTimeEqual(username, config.adminUsername);
      const passwordOk = bcrypt.compareSync(password, config.adminPasswordHash);

      if (!usernameOk || !passwordOk) {
        res.status(401).json({ error: { code: "UNAUTHORIZED", message: "Invalid credentials" } });
        return;
      }

      const token = signToken(config.authTokenSecret, username);
      res.status(200).json({ token });
    })
  );

  return router;
}
