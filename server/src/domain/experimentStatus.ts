import { ExperimentStatus } from "@prisma/client";

// Single source of truth on the server: derived from the Prisma enum, so adding a status to
// prisma/schema.prisma automatically updates API validation. The client keeps its own copy in
// client/src/domain/experimentStatus.ts; test/domain/experimentsCrud.test.ts fails if the two drift.
export const EXPERIMENT_STATUSES: readonly string[] = Object.values(ExperimentStatus);
