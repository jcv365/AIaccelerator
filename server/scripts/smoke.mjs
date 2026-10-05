#!/usr/bin/env node
// Smoke test for a running stack: node scripts/smoke.mjs   (or: npm run smoke)
//
//   SMOKE_BASE_URL   default http://localhost:8080  (the client's nginx; use http://localhost:4000 for the API directly)
//   SMOKE_USERNAME / SMOKE_PASSWORD   optional - enables the login + authenticated-list checks
//
// Exit code 0 = every check passed, 1 = at least one failed. Never prints credentials or tokens.

const base = (process.env.SMOKE_BASE_URL ?? "http://localhost:8080").replace(/\/$/, "");
// Through nginx the API lives under /api (and /auth); directly on the server it has no prefix.
const viaNginx = !base.endsWith(":4000");
const api = (path) => `${base}${viaNginx ? "/api" : ""}${path}`;
const authUrl = `${base}/auth/login`;

let failures = 0;
function check(name, ok, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` - ${detail}` : ""}`);
  if (!ok) failures += 1;
}

async function get(url, headers = {}) {
  const res = await fetch(url, { headers, signal: AbortSignal.timeout(15_000) });
  return res;
}

try {
  const health = await get(api("/health"));
  check("GET /health is 200", health.status === 200, `status ${health.status}`);
  check("security headers present", health.headers.get("x-content-type-options") === "nosniff");

  const ready = await get(api("/ready"));
  check("GET /ready is 200 (database reachable)", ready.status === 200, `status ${ready.status}`);

  const version = await get(api("/version"));
  check("GET /version is 200", version.status === 200, `status ${version.status}`);

  const anon = await get(api("/opportunities"));
  check("unauthenticated GET /opportunities is 401", anon.status === 401, `status ${anon.status}`);

  const bad = await fetch(authUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "smoke-test-nobody", password: "wrong" }),
    signal: AbortSignal.timeout(15_000),
  });
  check("login with wrong credentials is 401 (or 429 if rate limited)", bad.status === 401 || bad.status === 429, `status ${bad.status}`);

  const { SMOKE_USERNAME, SMOKE_PASSWORD } = process.env;
  if (SMOKE_USERNAME && SMOKE_PASSWORD) {
    const login = await fetch(authUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: SMOKE_USERNAME, password: SMOKE_PASSWORD }),
      signal: AbortSignal.timeout(15_000),
    });
    check("login with SMOKE_* credentials is 200", login.status === 200, `status ${login.status}`);
    if (login.status === 200) {
      const { token } = await login.json();
      const list = await get(api("/opportunities"), { Authorization: `Bearer ${token}` });
      check("authenticated GET /opportunities is 200", list.status === 200, `status ${list.status}`);
      if (list.status === 200) {
        const rows = await list.json();
        check("opportunities response is a list", Array.isArray(rows), `${Array.isArray(rows) ? rows.length : "?"} rows`);
      }
    }
  } else {
    console.log("SKIP  login + authenticated list (set SMOKE_USERNAME and SMOKE_PASSWORD to enable)");
  }
} catch (err) {
  check("smoke run completed without throwing", false, String(err));
}

console.log(failures === 0 ? "\nSMOKE OK" : `\nSMOKE FAILED (${failures} check${failures === 1 ? "" : "s"})`);
process.exit(failures === 0 ? 0 : 1);
