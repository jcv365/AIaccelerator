// The one client-side list of experiment statuses (used by the status picker and the PoV pipeline).
// It must match the server's list, which is derived from the Prisma ExperimentStatus enum;
// server/test/domain/experimentsCrud.test.ts fails if the two drift apart.
export const EXPERIMENT_STATUSES = ["PLANNED", "RUNNING", "COMPLETE", "ABANDONED"] as const;
export type ExperimentStatusValue = (typeof EXPERIMENT_STATUSES)[number];
