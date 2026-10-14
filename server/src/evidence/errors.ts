export type EvidenceErrorCode = "UNSUPPORTED_TYPE" | "UNREADABLE" | "NO_TEXT" | "TOO_LARGE";

/** A problem with an uploaded evidence file that the user can understand and act on. */
export class EvidenceError extends Error {
  constructor(
    public readonly code: EvidenceErrorCode,
    message: string
  ) {
    super(message);
    this.name = "EvidenceError";
  }
}
