export type AiErrorCode =
  | "AI_NOT_CONFIGURED"
  | "AI_UPSTREAM_ERROR"
  | "AI_BUSY"
  | "AI_BAD_REQUEST"
  | "AI_UNREACHABLE";

export class AiClientError extends Error {
  constructor(
    public readonly code: AiErrorCode,
    message: string
  ) {
    super(message);
    this.name = "AiClientError";
  }
}

export function aiErrorStatus(code: AiErrorCode): number {
  switch (code) {
    case "AI_NOT_CONFIGURED":
      return 503;
    case "AI_BUSY":
      return 409;
    case "AI_BAD_REQUEST":
      return 400;
    case "AI_UPSTREAM_ERROR":
    case "AI_UNREACHABLE":
      return 502;
    default:
      return 502;
  }
}
