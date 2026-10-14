import { createHash } from "node:crypto";
import path from "node:path";
import { Router } from "express";
import type { NextFunction, Request, Response } from "express";
import multer from "multer";
import { rateLimit } from "express-rate-limit";
import type { PrismaClient } from "@prisma/client";
import { asyncHandler } from "../asyncHandler.js";
import { EvidenceError } from "./errors.js";
import { extractEvidenceText, MAX_FILE_BYTES, type EvidenceKind } from "./extract.js";

const MAX_FILES_PER_UPLOAD = 5;
const MAX_FILENAME_LENGTH = 120;

const MIME_BY_KIND: Record<EvidenceKind, string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  csv: "text/csv",
  text: "text/plain",
};

const LISTED_FIELDS = {
  id: true,
  filename: true,
  mimeType: true,
  sizeBytes: true,
  charCount: true,
  truncated: true,
  uploadedAt: true,
} as const;

interface ListedDocument {
  id: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  charCount: number;
  truncated: boolean;
  uploadedAt: Date;
}

const toDto = (d: ListedDocument) => ({
  id: d.id,
  filename: d.filename,
  mimeType: d.mimeType,
  sizeBytes: d.sizeBytes,
  charCount: d.charCount,
  truncated: d.truncated,
  uploadedAt: d.uploadedAt,
});

/**
 * A safe display name for an uploaded file: base name only (no folders or "../"), no control characters, a sane
 * length. Browsers send UTF-8 names that the multipart parser may decode as Latin-1, so those are repaired.
 */
export function cleanFilename(raw: string): string {
  let name = raw;
  const codes = Array.from(name, (c) => c.charCodeAt(0));
  if (codes.some((c) => c >= 0x80) && codes.every((c) => c <= 0xff)) {
    const repaired = Buffer.from(name, "latin1").toString("utf8");
    if (!repaired.includes("�")) name = repaired;
  }
  name = (name.split(/[\\/]/).pop() ?? "")
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001F\u007F]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (name === "" || name === "." || name === "..") return "document";
  if (name.length > MAX_FILENAME_LENGTH) {
    const ext = path.extname(name).slice(0, 10);
    name = name.slice(0, MAX_FILENAME_LENGTH - ext.length) + ext;
  }
  return name;
}

const notFound = (res: Response) =>
  res.status(404).json({ error: { code: "NOT_FOUND", message: "Company not found" } });

/** Evidence documents for a company: upload files, list them, remove them. Mounted under /companies. */
export function createEvidenceDocumentsRouter(prisma: PrismaClient): Router {
  const router = Router();

  // Files are kept in memory only while being read; nothing is written to disk.
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_FILE_BYTES, files: MAX_FILES_PER_UPLOAD, fields: 5, parts: MAX_FILES_PER_UPLOAD + 5 },
  }).array("files");

  const uploadLimiter = rateLimit({ windowMs: 60_000, limit: 20, standardHeaders: true, legacyHeaders: false });

  const requireCompany = asyncHandler(async (req, res, next) => {
    const company = await prisma.company.findUnique({ where: { id: req.params.id } });
    if (!company) {
      notFound(res);
      return;
    }
    next();
  });

  const readUpload = (req: Request, res: Response, next: NextFunction) => {
    upload(req, res, (err: unknown) => {
      if (!err) return next();
      if (err instanceof multer.MulterError) {
        if (err.code === "LIMIT_FILE_SIZE") {
          res.status(413).json({ error: { code: "TOO_LARGE", message: "A file is larger than 10 MB." } });
        } else if (err.code === "LIMIT_FILE_COUNT") {
          res.status(400).json({ error: { code: "TOO_MANY_FILES", message: `Upload at most ${MAX_FILES_PER_UPLOAD} files at a time.` } });
        } else {
          res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "Send the files in the 'files' field." } });
        }
        return;
      }
      next(err);
    });
  };

  router.post(
    "/:id/evidence-documents",
    uploadLimiter,
    requireCompany,
    readUpload,
    asyncHandler(async (req, res) => {
      const companyId = req.params.id;
      const files = (req.files ?? []) as Express.Multer.File[];
      if (files.length === 0) {
        res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "Choose at least one file." } });
        return;
      }

      const documents: Array<ReturnType<typeof toDto> & { duplicate: boolean }> = [];
      const rejected: Array<{ filename: string; code: string; message: string }> = [];

      for (const file of files) {
        const filename = cleanFilename(file.originalname);
        try {
          const sha256 = createHash("sha256").update(file.buffer).digest("hex");
          const key = { companyId_sha256: { companyId, sha256 } };

          // The same file again: nothing to read or store. A removed one is brought back.
          const existing = await prisma.evidenceDocument.findUnique({ where: key });
          if (existing) {
            if (existing.deletedAt) {
              const restored = await prisma.evidenceDocument.update({ where: { id: existing.id }, data: { deletedAt: null } });
              documents.push({ ...toDto(restored), duplicate: false });
            } else {
              documents.push({ ...toDto(existing), duplicate: true });
            }
            continue;
          }

          const extracted = await extractEvidenceText(filename, file.buffer);
          try {
            const created = await prisma.evidenceDocument.create({
              data: {
                companyId,
                filename,
                mimeType: MIME_BY_KIND[extracted.kind],
                sizeBytes: file.size,
                sha256,
                extractedText: extracted.text,
                charCount: extracted.charCount,
                truncated: extracted.truncated,
              },
            });
            documents.push({ ...toDto(created), duplicate: false });
          } catch (err) {
            // Two uploads of the same file at once: the loser gets the winner back.
            if ((err as { code?: string }).code !== "P2002") throw err;
            const winner = await prisma.evidenceDocument.findUnique({ where: key });
            if (!winner) throw err;
            documents.push({ ...toDto(winner), duplicate: true });
          }
        } catch (err) {
          if (!(err instanceof EvidenceError)) throw err;
          rejected.push({ filename, code: err.code, message: err.message });
        }
      }

      res.status(documents.length === 0 ? 422 : 201).json({ documents, rejected });
    })
  );

  router.get(
    "/:id/evidence-documents",
    requireCompany,
    asyncHandler(async (req, res) => {
      const docs = await prisma.evidenceDocument.findMany({
        where: { companyId: req.params.id, deletedAt: null },
        orderBy: { uploadedAt: "desc" },
        select: LISTED_FIELDS,
      });
      res.status(200).json({ documents: docs.map(toDto) });
    })
  );

  // Removing hides the document from future scans. Its text is kept so past runs that used it stay explainable.
  router.delete(
    "/:id/evidence-documents/:docId",
    asyncHandler(async (req, res) => {
      const result = await prisma.evidenceDocument.updateMany({
        where: { id: req.params.docId, companyId: req.params.id, deletedAt: null },
        data: { deletedAt: new Date() },
      });
      if (result.count === 0) {
        res.status(404).json({ error: { code: "NOT_FOUND", message: "Document not found" } });
        return;
      }
      res.status(204).end();
    })
  );

  return router;
}
