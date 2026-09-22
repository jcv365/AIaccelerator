export interface AppConfig {
  databaseUrl: string;
  port: number;
  nodeEnv: string;
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
  const nodeEnv = env.NODE_ENV ?? "development";

  return { databaseUrl, port, nodeEnv };
}
