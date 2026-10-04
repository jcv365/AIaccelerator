// Placeholder data contract — POST /analyze does not exist yet (no backend
// endpoint; see SCREENS.md APP-03). This simulates the streaming shape a real
// conclave-backed analysis would have, so the UI can be built and reviewed
// now and swapped for a real fetch later without changing the component.

export type StreamedGaugeKey = "evidenceStrength" | "sourceCoverage" | "aiConfidence";

export interface StartAnalysisResult {
  opportunitiesFound: number;
}

const STREAM_STEPS: Array<{ key: StreamedGaugeKey; value: number; delayMs: number }> = [
  { key: "evidenceStrength", value: 0.71, delayMs: 220 },
  { key: "sourceCoverage", value: 0.58, delayMs: 220 },
  { key: "aiConfidence", value: 0.66, delayMs: 220 },
];

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Risk/Feasibility/Value are deliberately never populated here — this pass
 * only produces evidence-gathering signal, not the decision-recommendation
 * scoring that would feed those (see SCREENS.md APP-HYP, also missing).
 */
export async function runPlaceholderAnalysis(
  companyName: string,
  onProgress: (key: StreamedGaugeKey, value: number) => void
): Promise<StartAnalysisResult> {
  if (companyName.trim().length === 0) {
    throw new Error("Company name is required.");
  }
  for (const step of STREAM_STEPS) {
    await delay(step.delayMs);
    onProgress(step.key, step.value);
  }
  return { opportunitiesFound: 3 };
}
