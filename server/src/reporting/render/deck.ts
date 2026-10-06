import PptxGenJSModule from "pptxgenjs";
import {
  AUDIENCE_LABEL,
  CONFIDENTIAL,
  THEME,
  badRatingColor,
  cite,
  evidenceSummary,
  fileTitle,
  formatDate,
  goodRatingColor,
  ratingLabel,
  sortedOpportunities,
  statusLine,
  titleFor,
  DATA_STATUS_LABEL,
  type Audience,
  type RenderInput,
} from "./common.js";

// Builds a 16:9 deck from the saved report content. Pure code: no AI call, so rebuilding a deck never changes its
// wording. Layout follows the approved mockups (light pages, navy and blue, one idea per slide). Every body
// slide has a title, a footer with the status line and confidentiality marking, a slide number and speaker notes.

const W = 13.333;
const M = 0.6;
const BODY_TOP = 1.7;
const BODY_H = 5.1;
const CW = W - 2 * M;
const ROWS_PER_TABLE_SLIDE = 9;

// pptxgenjs is CommonJS; under NodeNext the default import is the module object, so unwrap its `default` class.
const PptxGenJS = ((PptxGenJSModule as unknown as { default?: unknown }).default ?? PptxGenJSModule) as typeof PptxGenJSModule.default;
type Pptx = InstanceType<typeof PptxGenJS>;
type Slide = ReturnType<Pptx["addSlide"]>;
type TableRow = Parameters<Slide["addTable"]>[0][number];
type TableCell = TableRow[number];

export async function renderDeck(input: RenderInput, audience: Audience): Promise<Buffer> {
  const { content, meta } = input;
  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_WIDE";
  pptx.title = fileTitle(content, audience);
  pptx.subject = `${AUDIENCE_LABEL[audience]} for ${content.company.name}`;
  pptx.author = meta.author;
  pptx.company = meta.author;

  const footer = `${statusLine(meta)}  ·  ${CONFIDENTIAL}`;
  pptx.defineSlideMaster({
    title: "COVER",
    background: { color: THEME.ink },
    objects: [{ rect: { x: 0, y: 0, w: 0.35, h: 7.5, fill: { color: THEME.blue } } }],
  });
  pptx.defineSlideMaster({
    title: "CONTENT",
    background: { color: THEME.paper },
    objects: [
      { rect: { x: 0, y: 0, w: W, h: 0.12, fill: { color: THEME.blue } } },
      { line: { x: M, y: 6.98, w: CW, h: 0, line: { color: THEME.rule, width: 0.75 } } },
      { text: { text: footer, options: { x: M, y: 7.03, w: 10.6, h: 0.3, fontFace: THEME.font, fontSize: 9, color: THEME.inkMuted } } },
    ],
    slideNumber: { x: W - M - 0.8, y: 7.03, w: 0.8, h: 0.3, fontFace: THEME.font, fontSize: 9, color: THEME.inkMuted, align: "right" },
  });

  const sources = input.sources;
  const opps = sortedOpportunities(content);
  const topOpps = opps.slice(0, 3);

  function body(eyebrow: string, title: string, notes: string): Slide {
    const s = pptx.addSlide({ masterName: "CONTENT" });
    s.addText(eyebrow.toUpperCase(), { x: M, y: 0.3, w: CW, h: 0.3, fontFace: THEME.font, fontSize: 11, bold: true, color: THEME.blue, charSpacing: 2 });
    s.addText(title, { x: M, y: 0.62, w: CW, h: 0.95, fontFace: THEME.font, fontSize: title.length > 70 ? 22 : 26, bold: true, color: THEME.ink, valign: "top", fit: "shrink" });
    s.addNotes(notes);
    return s;
  }

  function bullets(s: Slide, items: string[], box: { x: number; y: number; w: number; h: number }, fontSize = 15): void {
    if (!items.length) {
      s.addText("None listed.", { ...box, fontFace: THEME.font, fontSize, italic: true, color: THEME.inkMuted, valign: "top" });
      return;
    }
    s.addText(
      items.map((t) => ({ text: t, options: { bullet: { indent: 16 }, breakLine: true, paraSpaceAfter: 6 } })),
      { ...box, fontFace: THEME.font, fontSize, color: THEME.ink, valign: "top", fit: "shrink" }
    );
  }

  function card(s: Slide, x: number, y: number, w: number, h: number, heading: string, text: string, tint: string = THEME.paperSoft): void {
    s.addShape("rect", { x, y, w, h, fill: { color: tint }, line: { color: THEME.rule, width: 0.75 } });
    s.addText(heading.toUpperCase(), { x: x + 0.2, y: y + 0.12, w: w - 0.4, h: 0.3, fontFace: THEME.font, fontSize: 10, bold: true, color: THEME.blue, charSpacing: 1 });
    s.addText(text, { x: x + 0.2, y: y + 0.45, w: w - 0.4, h: h - 0.6, fontFace: THEME.font, fontSize: 13, color: THEME.ink, valign: "top", fit: "shrink" });
  }

  function table(s: Slide, header: string[], rows: TableRow[], colW: number[], y = BODY_TOP): void {
    const head: TableRow = header.map((h) => ({
      text: h,
      options: { bold: true, color: THEME.paper, fill: { color: THEME.ink }, fontFace: THEME.font, fontSize: 11, valign: "middle" },
    }));
    s.addTable([head, ...rows], { x: M, y, w: CW, colW, fontFace: THEME.font, fontSize: 11, color: THEME.ink, border: { type: "solid", color: THEME.rule, pt: 0.75 }, valign: "top", margin: [0.05, 0.08, 0.05, 0.08] });
  }

  const cell = (text: string, color: string = THEME.ink, bold = false): TableCell => ({ text, options: { color, bold, fontFace: THEME.font, fontSize: 11 } });

  function chunk<T>(items: T[], size: number): T[][] {
    const out: T[][] = [];
    for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
    return out.length ? out : [[]];
  }

  // 1. Cover
  {
    const s = pptx.addSlide({ masterName: "COVER" });
    s.addText(AUDIENCE_LABEL[audience].toUpperCase(), { x: 1, y: 1.5, w: 11, h: 0.4, fontFace: THEME.font, fontSize: 14, bold: true, color: "93C5FD", charSpacing: 3 });
    s.addText(`${content.company.name}: AI opportunity assessment`, { x: 1, y: 2.0, w: 11, h: 1.6, fontFace: THEME.font, fontSize: 38, bold: true, color: THEME.paper, valign: "top", fit: "shrink" });
    s.addText(content.executive.headline, { x: 1, y: 3.7, w: 10.5, h: 1.0, fontFace: THEME.font, fontSize: 18, color: "CBD5E1", valign: "top", fit: "shrink" });
    s.addText(`Version ${meta.version}  ·  ${formatDate(meta.generatedAt)}  ·  Prepared by ${meta.author}`, { x: 1, y: 5.5, w: 11, h: 0.35, fontFace: THEME.font, fontSize: 13, color: "CBD5E1" });
    s.addText(statusLine(meta), { x: 1, y: 5.9, w: 11, h: 0.35, fontFace: THEME.font, fontSize: 13, bold: true, color: meta.status === "DRAFT" ? "FCD34D" : "86EFAC" });
    s.addText(CONFIDENTIAL, { x: 1, y: 6.7, w: 11, h: 0.3, fontFace: THEME.font, fontSize: 10, color: "94A3B8" });
    s.addNotes(`Cover. ${statusLine(meta)}. Version ${meta.version}, generated ${formatDate(meta.generatedAt)}.`);
  }

  // 2. About this document
  {
    const s = body("About this document", "What this briefing is based on", "Explain the evidence labels before presenting. Findings come from public material only; nothing here uses client-internal data.");
    card(s, M, BODY_TOP, 5.9, 2.2, "Basis", `${sources.length} public source${sources.length === 1 ? "" : "s"} reviewed across ${opps.length} opportunit${opps.length === 1 ? "y" : "ies"}. ${content.evidenceNote}`);
    card(s, M + 6.2, BODY_TOP, 5.93, 2.2, "Document control", `Version ${meta.version}\nDate ${formatDate(meta.generatedAt)}\nPrepared by ${meta.author}\nStatus: ${statusLine(meta)}`);
    card(
      s,
      M,
      BODY_TOP + 2.45,
      CW,
      2.4,
      "How to read the evidence labels",
      "Fact: stated in a public source.   Inference: reasoned from facts.   Assumption: not yet confirmed with the client.   AI hypothesis: a proposal the AI generated that still needs testing. Ratings are qualitative judgements, not financial forecasts; no figures here are estimates of savings or revenue."
    );
  }

  // 3. Executive summary
  {
    const s = body("Executive summary", content.executive.headline, "Walk the paragraphs; keep the recommendation for the next slide.");
    bullets(s, content.executive.paragraphs, { x: M, y: BODY_TOP, w: CW, h: BODY_H }, 16);
  }

  // 4. Recommendation and board ask
  {
    const s = body(audience === "C_LEVEL" ? "Recommendation" : "Recommended first step", "What we recommend, and the decision we ask for", "Close on the ask. Everything later in the deck supports this slide.");
    card(s, M, BODY_TOP, 5.9, 3.4, "Recommendation", content.executive.recommendation);
    card(s, M + 6.2, BODY_TOP, 5.93, 3.4, "Decision requested", content.executive.boardAsk, "E8F0FE");
  }

  // 5. Priorities
  {
    const s = body("Context", `What ${content.company.name} says matters most`, `Priorities are drawn from public material. Sources: ${content.priorities.flatMap((p) => p.sourceIds).join(", ") || "none"}.`);
    bullets(s, content.priorities.map((p) => `${p.priority}${cite(p.sourceIds)}`), { x: M, y: BODY_TOP, w: CW, h: BODY_H }, 16);
  }

  // 6. Where AI creates value: cards for the top opportunities
  {
    const s = body("Where AI creates value", `${opps.length === 1 ? "One AI opportunity stands" : `${opps.length} AI opportunities, the top ${topOpps.length} shown, stand`} out`, "Ranked by value, feasibility and confidence, with risk counted against. The ranking is qualitative.");
    const w = (CW - 0.3 * (topOpps.length - 1)) / topOpps.length;
    topOpps.forEach((o, i) => {
      const x = M + i * (w + 0.3);
      s.addShape("rect", { x, y: BODY_TOP, w, h: 4.9, fill: { color: THEME.paperSoft }, line: { color: THEME.rule, width: 0.75 } });
      s.addText(`OPPORTUNITY ${o.rank}`, { x: x + 0.2, y: BODY_TOP + 0.15, w: w - 0.4, h: 0.3, fontFace: THEME.font, fontSize: 10, bold: true, color: THEME.blue, charSpacing: 1 });
      s.addText(titleFor(input, o.opportunityId), { x: x + 0.2, y: BODY_TOP + 0.5, w: w - 0.4, h: 1.1, fontFace: THEME.font, fontSize: 16, bold: true, color: THEME.ink, valign: "top", fit: "shrink" });
      s.addText(o.whyItMatters, { x: x + 0.2, y: BODY_TOP + 1.7, w: w - 0.4, h: 2.3, fontFace: THEME.font, fontSize: 12, color: THEME.ink, valign: "top", fit: "shrink" });
      s.addText(evidenceSummary(o.evidence), { x: x + 0.2, y: BODY_TOP + 4.15, w: w - 0.4, h: 0.6, fontFace: THEME.font, fontSize: 9, color: THEME.inkMuted, valign: "top" });
    });
  }

  // 7. Prioritisation matrix (value vs feasibility), drawn from shapes
  {
    const s = body("Prioritisation", "Value against feasibility", "Bubble numbers are the rank. Top-right is high value and high feasibility. Ratings are qualitative; see the next slide for the reasoning.");
    const gx = M + 1.3;
    const gy = BODY_TOP + 0.1;
    const gw = 6.3;
    const gh = 4.4;
    const cw = gw / 3;
    const ch = gh / 3;
    const levelName = ["Low", "Medium", "High"];
    for (let col = 0; col < 3; col++) {
      for (let row = 0; row < 3; row++) {
        // Row 0 is the top row (high value); column 2 is the right-hand column (high feasibility).
        const best = col === 2 && row === 0;
        s.addShape("rect", { x: gx + col * cw, y: gy + row * ch, w: cw, h: ch, fill: { color: best ? "E8F0FE" : THEME.paperSoft }, line: { color: THEME.rule, width: 0.75 } });
      }
      s.addText(levelName[col], { x: gx + col * cw, y: gy + gh + 0.05, w: cw, h: 0.3, fontFace: THEME.font, fontSize: 10, color: THEME.inkMuted, align: "center" });
    }
    for (let row = 0; row < 3; row++) {
      s.addText(levelName[2 - row], { x: gx - 0.85, y: gy + row * ch, w: 0.75, h: ch, fontFace: THEME.font, fontSize: 10, color: THEME.inkMuted, align: "right", valign: "middle" });
    }
    // Opportunities that share a cell are spread sideways so no bubble hides another.
    const level = { LOW: 0, MEDIUM: 1, HIGH: 2 } as const;
    const cellKey = (o: (typeof opps)[number]) => `${o.ratings.feasibility}-${o.ratings.value}`;
    const total = new Map<string, number>();
    for (const o of opps) total.set(cellKey(o), (total.get(cellKey(o)) ?? 0) + 1);
    const seen = new Map<string, number>();
    for (const o of opps) {
      const key = cellKey(o);
      const n = seen.get(key) ?? 0;
      seen.set(key, n + 1);
      const inRow = Math.min(3, total.get(key)! - Math.floor(n / 3) * 3);
      const rows = Math.ceil(total.get(key)! / 3);
      const cx = gx + level[o.ratings.feasibility] * cw + cw / 2 + ((n % 3) - (inRow - 1) / 2) * 0.6;
      const cy = gy + (2 - level[o.ratings.value]) * ch + ch / 2 + (Math.floor(n / 3) - (rows - 1) / 2) * 0.6;
      s.addShape("ellipse", { x: cx - 0.25, y: cy - 0.25, w: 0.5, h: 0.5, fill: { color: THEME.blue }, line: { color: THEME.paper, width: 1.5 } });
      s.addText(String(o.rank), { x: cx - 0.25, y: cy - 0.25, w: 0.5, h: 0.5, fontFace: THEME.font, fontSize: 12, bold: true, color: THEME.paper, align: "center", valign: "middle", margin: 0 });
    }
    s.addText("Feasibility", { x: gx, y: gy + gh + 0.35, w: gw, h: 0.3, fontFace: THEME.font, fontSize: 10, bold: true, color: THEME.ink, align: "center" });
    s.addText("Value", { x: M - 0.75, y: gy + gh / 2 - 0.15, w: 1.8, h: 0.3, fontFace: THEME.font, fontSize: 10, bold: true, color: THEME.ink, align: "center", rotate: 270 });
    s.addText(
      opps.map((o) => ({ text: `${o.rank}. ${titleFor(input, o.opportunityId)}`, options: { breakLine: true, paraSpaceAfter: 4 } })),
      { x: gx + gw + 0.5, y: gy, w: CW - gw - 1.8, h: gh, fontFace: THEME.font, fontSize: 12, color: THEME.ink, valign: "top", fit: "shrink" }
    );
  }

  // 8. Ratings table (paged)
  chunk(opps, 4).forEach((group, page, all) => {
    const s = body("Prioritisation", `Ratings and reasoning${all.length > 1 ? ` (${page + 1} of ${all.length})` : ""}`, "Ratings are qualitative judgements with their rationale. Confidence reflects how strong the public evidence is.");
    table(
      s,
      ["#", "Opportunity", "Value", "Feasibility", "Risk", "Confidence", "Why"],
      group.map((o) => [
        cell(String(o.rank), THEME.ink, true),
        cell(titleFor(input, o.opportunityId), THEME.ink, true),
        cell(ratingLabel(o.ratings.value), goodRatingColor(o.ratings.value), true),
        cell(ratingLabel(o.ratings.feasibility), goodRatingColor(o.ratings.feasibility), true),
        cell(ratingLabel(o.ratings.risk), badRatingColor(o.ratings.risk), true),
        cell(ratingLabel(o.ratings.confidence), goodRatingColor(o.ratings.confidence), true),
        cell(o.ratingRationale),
      ]),
      [0.4, 2.6, 0.85, 1.0, 0.75, 1.0, CW - 6.6]
    );
  });

  // 9. One slide per opportunity (the top ones for the C-level deck; all of them for the technical deck)
  const detailOpps = audience === "C_LEVEL" ? topOpps : opps;
  for (const o of detailOpps) {
    const title = titleFor(input, o.opportunityId);
    const s = body(`Opportunity ${o.rank}`, title, `Evidence: ${evidenceSummary(o.evidence)}. Sources: ${o.sourceIds.join(", ") || "none public"}.`);
    card(s, M, BODY_TOP, 5.9, 1.5, "What it is", o.summary);
    card(s, M + 6.2, BODY_TOP, 5.93, 1.5, "Why it matters", o.whyItMatters);
    card(s, M, BODY_TOP + 1.7, 5.9, 1.5, "How feasible", o.feasibility);
    card(s, M + 6.2, BODY_TOP + 1.7, 5.93, 1.5, "First step", o.firstStep, "E8F0FE");
    s.addText(o.risks.length > 3 ? `Key risks (3 of ${o.risks.length}; all in the proposal)` : "Key risks", { x: M, y: BODY_TOP + 3.4, w: 5.9, h: 0.3, fontFace: THEME.font, fontSize: 11, bold: true, color: THEME.blue });
    bullets(s, o.risks.slice(0, 3), { x: M, y: BODY_TOP + 3.7, w: 5.9, h: 1.2 }, 11);
    s.addText("Data needed", { x: M + 6.2, y: BODY_TOP + 3.4, w: 5.93, h: 0.3, fontFace: THEME.font, fontSize: 11, bold: true, color: THEME.blue });
    bullets(s, o.dataNeeded.slice(0, 4), { x: M + 6.2, y: BODY_TOP + 3.7, w: 5.93, h: 1.2 }, 11);
    s.addText(`Evidence: ${evidenceSummary(o.evidence)}${cite(o.sourceIds)}`, { x: M, y: BODY_TOP + 4.85, w: CW, h: 0.3, fontFace: THEME.font, fontSize: 9, color: THEME.inkMuted });
  }

  // 10. Technical deck: architecture, data, integration, security, proof of value
  if (audience === "TECHNICAL") {
    for (const a of content.technical.architecture) {
      const title = titleFor(input, a.opportunityId);
      const s = body("Architecture", title, `Component diagram for ${title}. ${a.components.map((c) => `${c.name}: ${c.role}`).join(". ")}. ${a.notes}`);
      const n = a.components.length;
      const gap = 0.35;
      const bw = (CW - gap * (n - 1)) / n;
      a.components.forEach((c, i) => {
        const x = M + i * (bw + gap);
        s.addShape("rect", { x, y: BODY_TOP + 0.2, w: bw, h: 1.0, fill: { color: i === 0 ? THEME.paperSoft : "E8F0FE" }, line: { color: THEME.blue, width: 1.25 } });
        s.addText(c.name, { x: x + 0.05, y: BODY_TOP + 0.2, w: bw - 0.1, h: 1.0, fontFace: THEME.font, fontSize: 12, bold: true, color: THEME.ink, align: "center", valign: "middle", fit: "shrink" });
        if (i < n - 1) s.addShape("rightArrow", { x: x + bw + 0.03, y: BODY_TOP + 0.55, w: gap - 0.06, h: 0.3, fill: { color: THEME.blue }, line: { color: THEME.blue, width: 0.5 } });
        s.addText(c.role, { x, y: BODY_TOP + 1.35, w: bw, h: 1.6, fontFace: THEME.font, fontSize: 11, color: THEME.inkMuted, align: "center", valign: "top", fit: "shrink" });
      });
      card(s, M, BODY_TOP + 3.2, CW, 1.6, "Assumptions behind this design", a.notes);
    }

    chunk(content.technical.dataRequirements, ROWS_PER_TABLE_SLIDE).forEach((group, page, all) => {
      const s = body("Data requirements", `What data the work needs${all.length > 1 ? ` (${page + 1} of ${all.length})` : ""}`, "Status shows whether each need is backed by public evidence, assumed, or still to be confirmed with the client.");
      table(
        s,
        ["Data", "Needed for", "Status", "Sources"],
        group.map((d) => [
          cell(d.source, THEME.ink, true),
          cell(d.neededFor),
          cell(DATA_STATUS_LABEL[d.status], d.status === "PUBLIC_EVIDENCE" ? THEME.green : d.status === "ASSUMPTION" ? THEME.amber : THEME.red, true),
          cell(d.sourceIds.join(", ") || "None"),
        ]),
        [3.4, 4.4, 1.9, CW - 9.7]
      );
    });

    {
      const s = body("Integration and security", "How this fits the client's environment", "Integration and security statements are design intentions to confirm in discovery, not commitments.");
      s.addText("Integration", { x: M, y: BODY_TOP, w: 5.9, h: 0.35, fontFace: THEME.font, fontSize: 14, bold: true, color: THEME.blue });
      bullets(s, content.technical.integration, { x: M, y: BODY_TOP + 0.45, w: 5.9, h: 4.4 }, 13);
      s.addText("Security and privacy", { x: M + 6.2, y: BODY_TOP, w: 5.93, h: 0.35, fontFace: THEME.font, fontSize: 14, bold: true, color: THEME.blue });
      bullets(s, content.technical.security, { x: M + 6.2, y: BODY_TOP + 0.45, w: 5.93, h: 4.4 }, 13);
    }

    {
      const s = body("Proof of value", "How we would prove it works before scaling", "Agree the success metric and the go or no-go rule before the test starts, not after.");
      const w = (CW - 0.6) / 3;
      card(s, M, BODY_TOP, w, 3.6, "Scope", content.technical.pov.scope);
      card(s, M + w + 0.3, BODY_TOP, w, 3.6, "Success metric", content.technical.pov.successMetric);
      card(s, M + 2 * (w + 0.3), BODY_TOP, w, 3.6, "Go or no-go", content.technical.pov.goNoGo, "E8F0FE");
    }
  }

  // 11. Roadmap
  {
    const phases = content.roadmap.phases;
    const s = body("Roadmap", "A phased path from discovery to scale", `Durations are indicative. ${phases.map((p) => `${p.name}: ${p.duration}`).join(". ")}.`);
    const gap = 0.12;
    const pw = (CW - gap * (phases.length - 1)) / phases.length;
    phases.forEach((p, i) => {
      const x = M + i * (pw + gap);
      s.addShape("homePlate", { x, y: BODY_TOP, w: pw, h: 0.9, fill: { color: THEME.blue }, line: { color: THEME.blue, width: 0.5 } });
      s.addText([{ text: p.name, options: { bold: true, fontSize: 14, breakLine: true } }, { text: p.duration, options: { fontSize: 11 } }], { x: x + 0.1, y: BODY_TOP, w: pw - 0.4, h: 0.9, fontFace: THEME.font, color: THEME.paper, valign: "middle", fit: "shrink" });
      s.addText("Objectives", { x, y: BODY_TOP + 1.05, w: pw, h: 0.3, fontFace: THEME.font, fontSize: 10, bold: true, color: THEME.blue });
      bullets(s, p.objectives, { x, y: BODY_TOP + 1.35, w: pw - 0.1, h: 1.7 }, 11);
      s.addText("Deliverables", { x, y: BODY_TOP + 3.1, w: pw, h: 0.3, fontFace: THEME.font, fontSize: 10, bold: true, color: THEME.blue });
      bullets(s, p.deliverables, { x, y: BODY_TOP + 3.4, w: pw - 0.1, h: 1.5 }, 11);
    });
  }

  // 12. Risks (paged)
  chunk(content.risks, 4).forEach((group, page, all) => {
    const s = body("Risks", `What could go wrong, and how we manage it${all.length > 1 ? ` (${page + 1} of ${all.length})` : ""}`, "Likelihood and impact are qualitative. Each risk has a mitigation that someone can own.");
    table(
      s,
      ["Risk", "Likelihood", "Impact", "Mitigation"],
      group.map((r) => [cell(r.risk, THEME.ink, true), cell(ratingLabel(r.likelihood), badRatingColor(r.likelihood), true), cell(ratingLabel(r.impact), badRatingColor(r.impact), true), cell(r.mitigation)]),
      [3.6, 1.2, 1.1, CW - 5.9]
    );
  });

  // 13. Evidence and confidence, with a native chart
  {
    const s = body("Evidence and confidence", "How strong the evidence is", `${content.evidenceNote} Counts are read from the database and match the opportunity pages.`);
    // Horizontal bars draw the first category at the bottom, so feed them reversed to show rank 1 on top.
    const chartOpps = [...opps].reverse();
    const labels = chartOpps.map((o) => `Opportunity ${o.rank}`);
    s.addChart(
      pptx.ChartType.bar,
      [
        { name: "Facts", labels, values: chartOpps.map((o) => o.evidence.facts) },
        { name: "Inferences", labels, values: chartOpps.map((o) => o.evidence.inferences) },
        { name: "Assumptions", labels, values: chartOpps.map((o) => o.evidence.assumptions) },
        { name: "AI hypotheses", labels, values: chartOpps.map((o) => o.evidence.hypotheses) },
      ],
      {
        x: M,
        y: BODY_TOP,
        w: 7.4,
        h: 4.9,
        barDir: "bar",
        barGrouping: "stacked",
        chartColors: [THEME.green, THEME.blue, THEME.amber, "7C3AED"],
        showLegend: true,
        legendPos: "b",
        legendFontFace: THEME.font,
        legendFontSize: 10,
        catAxisLabelFontFace: THEME.font,
        catAxisLabelFontSize: 10,
        valAxisLabelFontFace: THEME.font,
        valAxisLabelFontSize: 10,
        valAxisMajorUnit: 1,
        altText: `Stacked bar chart of evidence by type for each opportunity: ${opps.map((o) => `${titleFor(input, o.opportunityId)} has ${evidenceSummary(o.evidence)}`).join("; ")}.`,
      }
    );
    card(s, M + 7.7, BODY_TOP, CW - 7.7, 4.9, "Reading this chart", `${content.evidenceNote}\n\nFacts come straight from public sources. Inferences, assumptions and AI hypotheses are labelled so they are never mistaken for facts.`);
  }

  // 14. Assumptions and open questions
  {
    const s = body("Assumptions and open questions", "What we still need to confirm", "Walk through each open question with the client; they decide the first two weeks of discovery.");
    s.addText("Assumptions", { x: M, y: BODY_TOP, w: 5.9, h: 0.35, fontFace: THEME.font, fontSize: 14, bold: true, color: THEME.blue });
    bullets(s, content.assumptions, { x: M, y: BODY_TOP + 0.45, w: 5.9, h: 4.4 }, 13);
    s.addText("Open questions", { x: M + 6.2, y: BODY_TOP, w: 5.93, h: 0.35, fontFace: THEME.font, fontSize: 14, bold: true, color: THEME.blue });
    bullets(s, content.openQuestions, { x: M + 6.2, y: BODY_TOP + 0.45, w: 5.93, h: 4.4 }, 13);
  }

  // 15. Appendix: source register (paged) and glossary
  chunk(sources, 10).forEach((group, page, all) => {
    const s = body("Appendix", `Source register${all.length > 1 ? ` (${page + 1} of ${all.length})` : ""}`, "Every [S#] citation in this deck refers to this register.");
    if (group.length === 0) {
      s.addText("No public sources were found for this company. Findings rest on assumptions and AI hypotheses and must be validated.", { x: M, y: BODY_TOP, w: CW, h: 1, fontFace: THEME.font, fontSize: 15, italic: true, color: THEME.inkMuted });
      return;
    }
    table(s, ["Id", "Type", "Source", "Address"], group.map((src) => [cell(src.id, THEME.ink, true), cell(src.kind), cell(src.title), cell(src.url ? (src.url.length > 70 ? `${src.url.slice(0, 67)}...` : src.url) : "Not a web link")]), [0.6, 1.6, 3.2, CW - 5.4]);
  });

  if (content.glossary.length) {
    chunk(content.glossary, 8).forEach((group, page, all) => {
      const s = body("Appendix", `Glossary${all.length > 1 ? ` (${page + 1} of ${all.length})` : ""}`, "Plain-English definitions of terms used in this deck.");
      table(s, ["Term", "Meaning"], group.map((g) => [cell(g.term, THEME.ink, true), cell(g.definition)]), [2.6, CW - 2.6]);
    });
  }

  return (await pptx.write({ outputType: "nodebuffer" })) as Buffer;
}
