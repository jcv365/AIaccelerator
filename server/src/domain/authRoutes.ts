import { timingSafeEqual } from "node:crypto";
import { Router } from "express";
import bcrypt from "bcryptjs";
import { rateLimit as expressRateLimit } from "express-rate-limit";
import { asyncHandler } from "../asyncHandler.js";
import { signToken } from "../auth.js";

export interface AuthRouterConfig {
  adminUsername: string;
  adminPasswordHash: string;
  authTokenSecret: string;
}

export interface LoginRateLimitOptions {
  /** Failed logins allowed per client IP within the window before further attempts get 429. */
  maxFailedAttempts?: number;
  windowMs?: number;
}

function constantTimeEqual(a: string, b: string): boolean {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  return aBuf.length === bBuf.length && timingSafeEqual(aBuf, bBuf);
}

export function createAuthRouter(config: AuthRouterConfig, rateLimit: LoginRateLimitOptions = {}): Router {
  const router = Router();

  // Counts only failed logins (successful ones are skipped), per client IP. Once the cap is reached even a
  // correct password is refused until the window passes, so the limit actually stops password guessing.
  const loginLimiter = expressRateLimit({
    windowMs: rateLimit.windowMs ?? 15 * 60_000,
    limit: rateLimit.maxFailedAttempts ?? 10,
    skipSuccessfulRequests: true,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    handler: (_req, res) => {
      res
        .status(429)
        .json({ error: { code: "RATE_LIMITED", message: "Too many failed login attempts. Try again later." } });
    },
  });

  router.post(
    "/login",
    loginLimiter,
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
