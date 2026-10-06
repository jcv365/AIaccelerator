// The source register: every distinct place the evidence came from, numbered S1, S2... in first-seen order, so
// each claim in a report can cite sources by id and the document can list them all in one appendix.
// Built deterministically from the saved Evidence rows (never by the AI), so it cannot contain an invented source.

export type SourceKind = "SEC filing" | "Social media" | "Web" | "Document";

export interface SourceRef {
  id: string;
  kind: SourceKind;
  /** Only http(s) URLs are ever kept as links; anything else is plain text. */
  url: string | null;
  title: string;
}

const SOCIAL_HOST = /(^|\.)((linkedin|facebook|instagram|youtube|twitter|tiktok)\.com|x\.com|youtu\.be)$/;
const MAX_TITLE = 120;

function parseWebUrl(raw: string): URL | null {
  if (!/^https?:\/\//i.test(raw)) return null;
  try {
    return new URL(raw);
  } catch {
    return null;
  }
}

function hostWithoutWww(u: URL): string {
  return u.hostname.toLowerCase().replace(/^www\./, "");
}

/** One key per page: host (no www), port, path without trailing slash, query; the fragment is ignored. */
function keyFor(raw: string): string | null {
  const text = raw.trim();
  if (!text) return null;
  const url = parseWebUrl(text);
  if (url) return `url:${hostWithoutWww(url)}${url.port ? `:${url.port}` : ""}${url.pathname.replace(/\/+$/, "")}${url.search}`;
  return `doc:${text.replace(/\s+/g, " ").toLowerCase()}`;
}

export function buildSourceRegister(evidence: Array<{ source: string | null | undefined }>): {
  sources: SourceRef[];
  idFor: (source: string | null | undefined) => string | undefined;
} {
  const sources: SourceRef[] = [];
  const idByKey = new Map<string, string>();

  for (const row of evidence) {
    if (!row.source) continue;
    const key = keyFor(row.source);
    if (!key || idByKey.has(key)) continue;

    const id = `S${sources.length + 1}`;
    idByKey.set(key, id);
    const text = row.source.trim();
    const url = parseWebUrl(text);
    if (url) {
      const host = hostWithoutWww(url);
      const kind: SourceKind = /(^|\.)sec\.gov$/.test(host) ? "SEC filing" : SOCIAL_HOST.test(host) ? "Social media" : "Web";
      sources.push({ id, kind, url: text, title: host });
    } else {
      sources.push({ id, kind: "Document", url: null, title: text.replace(/\s+/g, " ").slice(0, MAX_TITLE) });
    }
  }

  return {
    sources,
    idFor: (source) => {
      if (!source) return undefined;
      const key = keyFor(source);
      return key ? idByKey.get(key) : undefined;
    },
  };
}
