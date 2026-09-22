type Level = "info" | "error";

export function logJson(level: Level, msg: string, fields: Record<string, unknown> = {}): void {
  const line = JSON.stringify({ level, msg, ...fields, time: new Date().toISOString() });
  if (level === "error") {
    console.error(line);
  } else {
    console.log(line);
  }
}
