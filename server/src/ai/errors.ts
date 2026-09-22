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
