import {
  BorderStyle,
  Bookmark,
  Document,
  Footer,
  Header,
  HeadingLevel,
  InternalHyperlink,
  Packer,
  PageBreak,
  PageNumber,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
  type ParagraphChild,
} from "docx";
import {
  AUDIENCE_LABEL,
  CONFIDENTIAL,
  DATA_STATUS_LABEL,
  THEME,
  badRatingColor,
  cite,
  evidenceSummary,
  analysisLine,
  fileTitle,
  formatDate,
  goodRatingColor,
  ratingLabel,
  sortedOpportunities,
  statusLine,
  titleFor,
  type Audience,
  type RenderInput,
} from "./common.js";

// Builds an A4 proposal document from the saved report content. Pure code: no AI call. Structure for every
// document: cover, document control, contents, numbered sections, appendices (source register and glossary), with
// a header, a footer carrying the status line, confidentiality marking and "Page X of Y", and file properties set.

const FONT = THEME.font;
const PAGE_MARGIN = 1134; // 2 cm in twips
const CONTENT_W = 11906 - 2 * PAGE_MARGIN; // A4 width minus margins, in twips

const run = (text: string, o: { bold?: boolean; color?: string; size?: number; italics?: boolean } = {}) =>
  new TextRun({ text, font: FONT, bold: o.bold, color: o.color ?? THEME.ink, size: o.size, italics: o.italics });

const para = (text: string, o: { bold?: boolean; color?: string; size?: number; italics?: boolean; after?: number } = {}) =>
  new Paragraph({ children: [run(text, o)], spacing: { after: o.after ?? 120, line: 276 } });

const h1 = (text: string) => new Paragraph({ heading: HeadingLevel.HEADING_1, children: [run(text, { bold: true, size: 32 })], spacing: { before: 360, after: 160 }, keepNext: true });
const h2 = (text: string) => new Paragraph({ heading: HeadingLevel.HEADING_2, children: [run(text, { bold: true, size: 26, color: THEME.blue })], spacing: { before: 240, after: 120 }, keepNext: true });
const label = (text: string) => new Paragraph({ children: [run(text.toUpperCase(), { bold: true, size: 17, color: THEME.blue })], spacing: { before: 120, after: 40 }, keepNext: true });

const bullet = (text: string) => new Paragraph({ children: [run(text)], bullet: { level: 0 }, spacing: { after: 60, line: 276 } });
const none = (): Paragraph[] => [para("None listed", { size: 19, italics: true, color: THEME.inkMuted })];

const noBorder = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" } as const;
const ruleLine = { style: BorderStyle.SINGLE, size: 4, color: THEME.rule } as const;
const cellBorders = { top: ruleLine, bottom: ruleLine, left: ruleLine, right: ruleLine };

interface CellOptions {
  fill?: string;
  header?: boolean;
  color?: string;
  bold?: boolean;
}

function makeCell(content: Paragraph[] | string, width: number, o: CellOptions = {}): TableCell {
  const children =
    typeof content === "string"
      ? [new Paragraph({ children: [run(content, { bold: o.bold || o.header, color: o.header ? THEME.paper : o.color, size: 19 })], spacing: { after: 40 } })]
      : content;
  return new TableCell({
    width: { size: width, type: WidthType.DXA },
    borders: cellBorders,
    shading: o.header ? { type: ShadingType.CLEAR, fill: THEME.ink, color: "auto" } : o.fill ? { type: ShadingType.CLEAR, fill: o.fill, color: "auto" } : undefined,
    margins: { top: 70, bottom: 70, left: 110, right: 110 },
    children,
  });
}

/** A cell whose width is filled in by the table it is placed in. */
type Cellish = string | ((width: number) => TableCell);
const cell = (content: Paragraph[] | string, o: CellOptions = {}): Cellish => (width) => makeCell(content, width, o);
const colored = (text: string, color: string): Cellish => cell(text, { color, bold: true });

function table(header: string[], rows: Cellish[][], weights: number[]): Table {
  const total = weights.reduce((a, b) => a + b, 0);
  const widths = weights.map((w) => Math.round((w / total) * CONTENT_W));
  const build = (c: Cellish, i: number) => (typeof c === "string" ? makeCell(c, widths[i]) : c(widths[i]));
  return new Table({
    width: { size: CONTENT_W, type: WidthType.DXA },
    columnWidths: widths,
    rows: [
      new TableRow({ tableHeader: true, cantSplit: true, children: header.map((h, i) => makeCell(h, widths[i], { header: true })) }),
      ...rows.map((r) => new TableRow({ cantSplit: true, children: r.map(build) })),
    ],
  });
}

/** Two-column "label | value" block used for document control and per-opportunity detail. */
function facts(rows: Array<[string, string | Paragraph[]]>): Table {
  const lw = Math.round(CONTENT_W * 0.25);
  const vw = CONTENT_W - lw;
  return new Table({
    width: { size: CONTENT_W, type: WidthType.DXA },
    columnWidths: [lw, vw],
    rows: rows.map(([k, v]) => new TableRow({ cantSplit: true, children: [makeCell(k, lw, { fill: THEME.paperSoft, bold: true }), makeCell(v, vw)] })),
  });
}

function callout(title: string, text: string, fill = "E8F0FE"): Table {
  return new Table({
    width: { size: CONTENT_W, type: WidthType.DXA },
    columnWidths: [CONTENT_W],
    rows: [
      new TableRow({
        cantSplit: true,
        children: [
          new TableCell({
            width: { size: CONTENT_W, type: WidthType.DXA },
            shading: { type: ShadingType.CLEAR, fill, color: "auto" },
            borders: { top: noBorder, bottom: noBorder, right: noBorder, left: { style: BorderStyle.SINGLE, size: 24, color: THEME.blue } },
            margins: { top: 120, bottom: 120, left: 200, right: 160 },
            children: [label(title), para(text, { after: 0 })],
          }),
        ],
      }),
    ],
  });
}

type Block = Paragraph | Table;

const spacer = () => new Paragraph({ children: [], spacing: { after: 120 } });

export async function renderDoc(input: RenderInput, audience: Audience): Promise<Buffer> {
  const { content, meta } = input;
  const opps = sortedOpportunities(content);
  const technical = audience === "TECHNICAL";
  const docTitle = fileTitle(content, audience);

  function opportunityDetail(o: (typeof opps)[number]): Table {
    return facts([
      ["What it is", o.summary],
      ["Why it matters", o.whyItMatters],
      ["How feasible", o.feasibility],
      ["Ratings", `Value ${ratingLabel(o.ratings.value)} · Feasibility ${ratingLabel(o.ratings.feasibility)} · Risk ${ratingLabel(o.ratings.risk)} · Confidence ${ratingLabel(o.ratings.confidence)}. ${o.ratingRationale}`],
      ["First step", o.firstStep],
      ["Key risks", o.risks.map(bullet)],
      ["Data needed", o.dataNeeded.length ? o.dataNeeded.map(bullet) : none()],
      ["Evidence", `${evidenceSummary(o.evidence)}${cite(o.sourceIds)}`],
    ]);
  }

  // ---- cover
  const cover: Block[] = [
    new Paragraph({ children: [], spacing: { before: 1800 } }),
    new Paragraph({ children: [run(AUDIENCE_LABEL[audience].toUpperCase(), { bold: true, color: THEME.blue, size: 24 })], spacing: { after: 160 } }),
    new Paragraph({ children: [run(`${content.company.name}: AI opportunity assessment`, { bold: true, size: 64 })], spacing: { after: 240 } }),
    new Paragraph({ children: [run(content.executive.headline, { color: THEME.inkMuted, size: 30 })], spacing: { after: 960 } }),
    para(`Version ${meta.version}  ·  ${formatDate(meta.generatedAt)}`, { size: 24, after: 80 }),
    para(`Prepared by ${meta.author}`, { size: 24, after: 80 }),
    para(statusLine(meta), { size: 24, bold: true, color: meta.status === "DRAFT" ? THEME.amber : THEME.green, after: 1400 }),
    para(CONFIDENTIAL, { size: 18, color: THEME.inkMuted }),
  ];

  // ---- document control + contents
  const buildControl = (): Block[] => [
    h1("Document control"),
    facts([
      ["Document", docTitle],
      ["Client", content.company.name],
      ["Version", String(meta.version)],
      ["Date", formatDate(meta.generatedAt)],
      ["Prepared by", meta.author],
      ["Status", statusLine(meta)],
      ["Analysis", analysisLine(meta)],
      ["Basis", `${input.sources.length} public source${input.sources.length === 1 ? "" : "s"}; ${opps.length} opportunit${opps.length === 1 ? "y" : "ies"} assessed. Public material only: no client-internal data was used.`],
    ]),
    spacer(),
    label("How to read the evidence labels"),
    para("Fact: stated in a public source. Inference: reasoned from facts. Assumption: not yet confirmed with the client. AI hypothesis: a proposal the AI generated that still needs testing. Ratings are qualitative judgements, not financial forecasts: nothing in this document is an estimate of savings or revenue.", { size: 20 }),
    spacer(),
    h1("Contents"),
    ...contents(),
    new Paragraph({ children: [new PageBreak()] }),
  ];

  // ---- body
  const body: Block[] = [];
  // A static, linked contents list: it renders everywhere (Word, previewers, phones), unlike a TOC field that is
  // empty until Word updates it. Page numbers are omitted on purpose because they cannot be known here.
  const toc: Array<{ id: string; text: string }> = [];
  const heading = (text: string): Paragraph => {
    const id = `section${toc.length + 1}`;
    toc.push({ id, text });
    return new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new Bookmark({ id, children: [run(text, { bold: true, size: 32 })] })], spacing: { before: 360, after: 160 }, keepNext: true });
  };
  const contents = (): Paragraph[] =>
    toc.map(({ id, text }) => new Paragraph({ children: [new InternalHyperlink({ anchor: id, children: [new TextRun({ text, font: FONT, color: THEME.blue, size: 22 })] })], spacing: { after: 80 } }));
  let n = 0;
  const section = (title: string) => body.push(heading(`${++n}. ${title}`));

  section(technical ? "Technical summary" : "Executive summary");
  content.executive.paragraphs.forEach((p) => body.push(para(p)));
  body.push(callout("Recommendation", content.executive.recommendation), spacer(), callout("Decision requested", content.executive.boardAsk, THEME.paperSoft), spacer());

  if (!technical) {
    section("Company context and priorities");
    body.push(para(content.company.summary));
    body.push(h2("What the company says matters most"));
    content.priorities.forEach((p) => body.push(bullet(`${p.priority}${cite(p.sourceIds)}`)));
  }

  section("AI opportunities");
  body.push(para("Opportunities are ranked by value and feasibility, with confidence in the evidence counted in and risk counted against. The ranking is qualitative."));
  body.push(
    table(
      ["#", "Opportunity", "Value", "Feasibility", "Risk", "Confidence"],
      opps.map((o) => [
        String(o.rank),
        cell(titleFor(input, o.opportunityId), { bold: true }),
        colored(ratingLabel(o.ratings.value), goodRatingColor(o.ratings.value)),
        colored(ratingLabel(o.ratings.feasibility), goodRatingColor(o.ratings.feasibility)),
        colored(ratingLabel(o.ratings.risk), badRatingColor(o.ratings.risk)),
        colored(ratingLabel(o.ratings.confidence), goodRatingColor(o.ratings.confidence)),
      ]),
      [0.6, 4, 1.2, 1.4, 1, 1.4]
    )
  );
  if (!technical) {
    for (const o of opps) {
      body.push(h2(`${o.rank}. ${titleFor(input, o.opportunityId)}`), opportunityDetail(o));
    }
  }

  if (technical) {
    section("Architecture options");
    body.push(para("Each design below is a starting point to confirm in discovery. Components are shown in the order data flows through them."));
    for (const a of content.technical.architecture) {
      body.push(h2(titleFor(input, a.opportunityId)));
      body.push(table(["Step", "Component", "Role"], a.components.map((c, i) => [String(i + 1), cell(c.name, { bold: true }), c.role]), [0.9, 2.6, 6]));
      body.push(spacer(), para(a.notes, { italics: true, color: THEME.inkMuted }));
    }
    section("Data requirements");
    body.push(
      table(
        ["Data", "Needed for", "Status", "Sources"],
        content.technical.dataRequirements.map((d) => [
          cell(d.source, { bold: true }),
          d.neededFor,
          colored(DATA_STATUS_LABEL[d.status], d.status === "PUBLIC_EVIDENCE" ? THEME.green : d.status === "ASSUMPTION" ? THEME.amber : THEME.red),
          d.sourceIds.join(", ") || "None",
        ]),
        [3, 3.6, 1.6, 1.4]
      )
    );
    section("Integration");
    body.push(...content.technical.integration.map(bullet));
    section("Security and privacy");
    body.push(...content.technical.security.map(bullet));
    section("Proof of value");
    body.push(facts([["Scope", content.technical.pov.scope], ["Success metric", content.technical.pov.successMetric], ["Go or no-go", content.technical.pov.goNoGo]]));
  }

  section("Roadmap");
  body.push(para("Durations are indicative and to be confirmed with the client."));
  body.push(
    table(
      ["Phase", "Duration", "Objectives", "Deliverables"],
      content.roadmap.phases.map((p) => [cell(p.name, { bold: true }), p.duration, cell(p.objectives.map(bullet)), cell(p.deliverables.length ? p.deliverables.map(bullet) : none())]),
      [1.8, 1.3, 3.6, 3]
    )
  );

  section("Risks");
  body.push(
    table(
      ["Risk", "Likelihood", "Impact", "Mitigation"],
      content.risks.map((r) => [cell(r.risk, { bold: true }), colored(ratingLabel(r.likelihood), badRatingColor(r.likelihood)), colored(ratingLabel(r.impact), badRatingColor(r.impact)), r.mitigation]),
      [3, 1.2, 1.1, 4.2]
    )
  );

  section("Evidence and confidence");
  body.push(para(content.evidenceNote));
  body.push(
    table(
      ["Opportunity", "Facts", "Inferences", "Assumptions", "AI hypotheses"],
      opps.map((o) => [cell(titleFor(input, o.opportunityId), { bold: true }), String(o.evidence.facts), String(o.evidence.inferences), String(o.evidence.assumptions), String(o.evidence.hypotheses)]),
      [4, 1, 1.3, 1.4, 1.5]
    )
  );

  section("Assumptions and open questions");
  body.push(h2("Assumptions"), ...content.assumptions.map(bullet), h2("Open questions"), ...content.openQuestions.map(bullet));

  // ---- appendices
  body.push(new Paragraph({ children: [new PageBreak()] }));
  body.push(heading("Appendix A. Source register"));
  body.push(para("Every [S#] citation in this document refers to this register."));
  if (input.sources.length === 0) {
    body.push(para("No public sources were found for this company. Findings rest on assumptions and AI hypotheses and must be validated.", { italics: true, color: THEME.inkMuted }));
  } else {
    body.push(table(["Id", "Type", "Source", "Address"], input.sources.map((s) => [cell(s.id, { bold: true }), s.kind, s.title, s.url ?? "Not a web link"]), [0.7, 1.5, 2.8, 5]));
  }
  if (technical) {
    body.push(heading("Appendix B. Opportunity detail"));
    for (const o of opps) body.push(h2(`${o.rank}. ${titleFor(input, o.opportunityId)}`), opportunityDetail(o));
  }
  if (content.glossary.length) {
    body.push(heading(`Appendix ${technical ? "C" : "B"}. Glossary`));
    body.push(table(["Term", "Meaning"], content.glossary.map((g) => [cell(g.term, { bold: true }), g.definition]), [2.2, 7]));
  }

  const headerChildren: ParagraphChild[] = [run(`${content.company.name}  ·  ${AUDIENCE_LABEL[audience]}`, { size: 16, color: THEME.inkMuted })];
  const doc = new Document({
    creator: meta.author,
    title: docTitle,
    subject: `${AUDIENCE_LABEL[audience]} for ${content.company.name}`,
    description: statusLine(meta),
    styles: { default: { document: { run: { font: FONT, size: 21, color: THEME.ink } } } },
    sections: [
      { properties: { page: { margin: { top: PAGE_MARGIN, bottom: PAGE_MARGIN, left: PAGE_MARGIN, right: PAGE_MARGIN } } }, children: cover },
      {
        properties: { page: { margin: { top: PAGE_MARGIN + 200, bottom: PAGE_MARGIN + 200, left: PAGE_MARGIN, right: PAGE_MARGIN }} },
        headers: {
          default: new Header({
            children: [new Paragraph({ children: headerChildren, border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: THEME.rule, space: 4 } } })],
          }),
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                border: { top: { style: BorderStyle.SINGLE, size: 4, color: THEME.rule, space: 4 } },
                tabStops: [{ type: "right", position: CONTENT_W }],
                children: [
                  run(`${statusLine(meta)}  ·  ${CONFIDENTIAL}`, { size: 15, color: THEME.inkMuted }),
                  new TextRun({ children: ["\tPage ", PageNumber.CURRENT, " of ", PageNumber.TOTAL_PAGES], font: FONT, size: 15, color: THEME.inkMuted }),
                ],
              }),
            ],
          }),
        },
        children: [...buildControl(), ...body],
      },
    ],
  });
  return Packer.toBuffer(doc);
}
