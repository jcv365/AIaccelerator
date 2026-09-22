import { Pool } from "pg";
import { logJson } from "./logger.js";

export function createPool(databaseUrl: string): Pool {
  const pool = new Pool({ connectionString: databaseUrl });
  // pg emits "error" on the pool when an idle client hits a background
  // error (e.g. the DB connection drops). Without a listener, Node treats
  // this as an uncaught error and crashes the process. Log and continue —
  // checkDbConnection()/the /ready route already surface connectivity loss.
  pool.on("error", (err) => {
    logJson("error", "postgres pool idle client error", {
      message: err instanceof Error ? err.message : String(err),
    });
  });
  return pool;
}

export async function checkDbConnection(pool: Pool): Promise<boolean> {
  try {
    await pool.query("SELECT 1");
    return true;
  } catch (err) {
    logJson("error", "database health check failed", {
      message: err instanceof Error ? err.message : String(err),
    });
    return false;
  }
}
