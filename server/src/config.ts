export interface AppConfig {
  databaseUrl: string;
  port: number;
  nodeEnv: string;
  councilBaseUrl?: string;
  councilApiKey?: string;
}

function requireEnv(env: NodeJS.ProcessEnv, key: string): string {
  const value = env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const databaseUrl = requireEnv(env, "DATABASE_URL");
  const port = Number(requireEnv(env, "PORT"));
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid PORT: must be an integer between 1 and 65535, got "${env.PORT}"`);
  }
  const nodeEnv = env.NODE_ENV ?? "development";
  const councilBaseUrl = env.COUNCIL_BASE_URL || undefined;
  const councilApiKey = env.COUNCIL_API_KEY || undefined;

  return { databaseUrl, port, nodeEnv, councilBaseUrl, councilApiKey };
}
