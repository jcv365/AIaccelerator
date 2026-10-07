import { Router } from "express";
import type { Company, PrismaClient } from "@prisma/client";
import { asyncHandler } from "../asyncHandler.js";
import { removeCompany } from "./removal.js";

const MAX_NAME_LENGTH = 120;
const MAX_WEBSITE_LENGTH = 200;
// Hosts that can never be a real public company website (cheap defence: the research tools will follow this
// address later, so keep internal-looking ones out at the door; the research side enforces its own guard too).
const INTERNAL_SUFFIX = /(^|\.)(local|localhost|internal|lan|home|corp|intranet)$/i;
const IPV4 = /^\d{1,3}(\.\d{1,3}){3}$/;

/** "Maersk", "maersk" and "  MAERSK " are one company: trim, collapse whitespace, lower-case. */
export function normalizeNameKey(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

type Parsed = { ok: true; value: { name: string; website: string | undefined } } | { ok: false; message: string };

function parseWebsite(raw: unknown): { ok: true; value: string | undefined } | { ok: false; message: string } {
  const bad = { ok: false as const, message: "website must be a valid public web address, like maersk.com" };
  if (raw === undefined || raw === null) return { ok: true, value: undefined };
  if (typeof raw !== "string") return bad;
  const trimmed = raw.trim();
  if (trimmed === "") return { ok: true, value: undefined };
  if (trimmed.length > MAX_WEBSITE_LENGTH) return bad;
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`;
  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    return bad;
  }
  const host = url.hostname;
  if (url.protocol !== "http:" && url.protocol !== "https:") return bad;
  if (url.username || url.password) return bad;
  if (host.startsWith("[") || IPV4.test(host)) return bad; // IP literals are never a company's public site
  if (!host.includes(".") || INTERNAL_SUFFIX.test(host)) return bad;
  return { ok: true, value: url.origin };
}

export function parseCompanyInput(body: Record<string, unknown>): Parsed {
  const rawName = body.name;
  if (typeof rawName !== "string") return { ok: false, message: "name is required" };
  const name = rawName.replace(/\s+/g, " ").trim();
  if (name === "") return { ok: false, message: "name is required" };
  if (name.length > MAX_NAME_LENGTH) return { ok: false, message: `name must be at most ${MAX_NAME_LENGTH} characters` };
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001F\u007F]/.test(name)) return { ok: false, message: "name contains invalid characters" };
  const website = parseWebsite(body.website);
  if (!website.ok) return { ok: false, message: website.message };
  return { ok: true, value: { name, website: website.value } };
}

/**
 * Returns the company with this name (any capitalisation), creating it if it does not exist. Safe against two
 * simultaneous creations: the loser hits the unique index and gets the winner back.
 */
export async function findOrCreateCompany(
  prisma: PrismaClient,
  input: { name: string; website?: string }
): Promise<{ company: Company; created: boolean }> {
  const name = input.name.replace(/\s+/g, " ").trim();
  const nameKey = normalizeNameKey(name);
  const existing = await prisma.company.findUnique({ where: { nameKey } });
  if (existing) return { company: existing, created: false };
  try {
    const company = await prisma.company.create({ data: { name, nameKey, website: input.website } });
    return { company, created: true };
  } catch (err) {
    if ((err as { code?: string }).code === "P2002") {
      const winner = await prisma.company.findUnique({ where: { nameKey } });
      if (winner) return { company: winner, created: false };
    }
    throw err;
  }
}

/**
 * Reads the optional ?companyId= filter. Absent = no filter. Anything but one short string (an id, never a
 * query operator or an array) is rejected so it can't reach the database query.
 */
export function parseCompanyIdQuery(value: unknown): { ok: true; id: string | undefined } | { ok: false } {
  if (value === undefined) return { ok: true, id: undefined };
  if (typeof value === "string" && value.length >= 1 && value.length <= 64) return { ok: true, id: value };
  return { ok: false };
}

const toDto = (c: Company) => ({ id: c.id, name: c.name, website: c.website, createdAt: c.createdAt });

/** Mounted at /companies. */
export function createCompaniesRouter(prisma: PrismaClient): Router {
  const router = Router();

  router.get(
    "/",
    asyncHandler(async (_req, res) => {
      const companies = await prisma.company.findMany({
        orderBy: { name: "asc" },
        include: { _count: { select: { opportunities: true } } },
      });
      res.status(200).json(
        companies.map((c) => ({ ...toDto(c), opportunityCount: c._count.opportunities }))
      );
    })
  );

  // Idempotent find-or-create: a duplicate name (any capitalisation) returns the existing company with
  // created:false so the UI can say "already exists, selected it" instead of failing.
  router.post(
    "/",
    asyncHandler(async (req, res) => {
      const parsed = parseCompanyInput((req.body ?? {}) as Record<string, unknown>);
      if (!parsed.ok) {
        res.status(400).json({ error: { code: "VALIDATION_ERROR", message: parsed.message } });
        return;
      }
      const { company, created } = await findOrCreateCompany(prisma, parsed.value);
      res.status(created ? 201 : 200).json({ created, company: toDto(company) });
    })
  );

  // The company's analysis history, newest first: one entry per run with the date it ran, how it ended and how
  // many opportunities it found (counted from what is still stored, so removed ones are not counted).
  router.get(
    "/:id/analyses",
    asyncHandler(async (req, res) => {
      const company = await prisma.company.findUnique({ where: { id: req.params.id } });
      if (!company) {
        res.status(404).json({ error: { code: "NOT_FOUND", message: "Company not found" } });
        return;
      }
      const jobs = await prisma.analysisJob.findMany({ where: { companyId: company.id }, orderBy: { createdAt: "desc" }, take: 50 });
      const counts = await prisma.opportunity.groupBy({
        by: ["analysisJobId"],
        where: { companyId: company.id, analysisJobId: { in: jobs.map((j) => j.id) } },
        _count: { _all: true },
      });
      const byJob = new Map(counts.map((c) => [c.analysisJobId, c._count._all]));
      res.status(200).json({
        analyses: jobs.map((j) => ({
          id: j.id,
          status: j.status,
          createdAt: j.createdAt,
          startedAt: j.startedAt,
          completedAt: j.completedAt,
          opportunities: byJob.get(j.id) ?? 0,
          error: j.errorCode ? { code: j.errorCode, message: j.errorMessage } : null,
        })),
      });
    })
  );

  // Edit the name and/or website. A name that another company already uses (any capitalisation) is refused.
  router.patch(
    "/:id",
    asyncHandler(async (req, res) => {
      const existing = await prisma.company.findUnique({ where: { id: req.params.id } });
      if (!existing) {
        res.status(404).json({ error: { code: "NOT_FOUND", message: "Company not found" } });
        return;
      }
      const body = (req.body ?? {}) as Record<string, unknown>;
      const parsed = parseCompanyInput({ name: existing.name, website: existing.website, ...body });
      if (!parsed.ok) {
        res.status(400).json({ error: { code: "VALIDATION_ERROR", message: parsed.message } });
        return;
      }
      const nameKey = normalizeNameKey(parsed.value.name);
      try {
        const updated = await prisma.company.update({
          where: { id: existing.id },
          data: { name: parsed.value.name, nameKey, website: parsed.value.website ?? null },
        });
        res.status(200).json(toDto(updated));
      } catch (err) {
        if ((err as { code?: string }).code === "P2002") {
          res.status(409).json({ error: { code: "NAME_TAKEN", message: "Another company already has that name" } });
          return;
        }
        throw err;
      }
    })
  );

  // Deletes the company and everything under it. The caller must repeat the company's exact name in
  // ?confirmName= so a stray request cannot wipe a company.
  router.delete(
    "/:id",
    asyncHandler(async (req, res) => {
      const existing = await prisma.company.findUnique({ where: { id: req.params.id } });
      if (!existing) {
        res.status(404).json({ error: { code: "NOT_FOUND", message: "Company not found" } });
        return;
      }
      if (req.query.confirmName !== existing.name) {
        res.status(400).json({ error: { code: "CONFIRM_REQUIRED", message: "Repeat the company name to confirm the deletion" } });
        return;
      }
      const result = await removeCompany(prisma, existing.id);
      if (!result.removed) {
        res.status(409).json({ error: { code: "COMPANY_BUSY", message: "An analysis or report is running for this company. Try again when it finishes." } });
        return;
      }
      res.status(200).json({ deleted: true, opportunities: result.opportunities });
    })
  );

  return router;
}
