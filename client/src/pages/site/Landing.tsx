import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { Button } from "../../components/ui";
import { BrandMark } from "../../components/BrandMark";
import { PRODUCT_NAME } from "../../brand";
import "./site.css";

// Art box is 1200 x 560. Node positions are drawn in it and the text labels sit beside them as percentages of the same box.
const W = 1200;
const H = 560;
const NODES = {
  Discover: [640, 185],
  Reason: [700, 355],
  Prove: [930, 185],
  Decide: [880, 385],
  Learn: [1085, 380],
} as const;

// The five steps, in journey order.
const JOURNEY = [
  { name: "Discover", text: "Find real opportunities" },
  { name: "Reason", text: "Analyse with evidence" },
  { name: "Prove", text: "Run 14-day PoVs" },
  { name: "Decide", text: "Prioritise and plan" },
  { name: "Learn", text: "Capture outcomes and scale" },
] as const;

const NODE_CLASS: Record<string, string> = { Discover: "1", Reason: "2", Prove: "3", Decide: "4", Learn: "5" };

const FEATURE_ICON = (path: ReactNode) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {path}
  </svg>
);

const STRIP = [
  { name: "Evidence-Based", text: "Decisions", icon: FEATURE_ICON(<><path d="M4 4v16h16" /><path d="M8 15l3-4 3 2 4-6" /></>) },
  { name: "Fail-Fast", text: "to Prove Value", icon: FEATURE_ICON(<><circle cx="12" cy="13" r="7" /><path d="M12 9v4l2.5 1.5M9 3h6" /></>) },
  { name: "Real Business", text: "Use Cases", icon: FEATURE_ICON(<><path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6z" /><path d="M9 12l2 2 4-4" /></>) },
  { name: "Measurable", text: "Outcomes", icon: FEATURE_ICON(<><path d="M5 20v-6M10 20V9M15 20v-9M20 20V5" /></>) },
  { name: "Expert-Guided", text: "Methodology", icon: FEATURE_ICON(<><path d="M20 12a8 8 0 1 1-2.3-5.7M20 4v5h-5" /></>) },
];

const WHY = [
  ["Evidence first", "Every claim is typed as fact, inference or assumption, so you can see how much rests on what."],
  ["Honest numbers", "An AI figure always says which model produced it, when, and why. Where nothing was assessed, it says so."],
  ["Decisions on record", "Scale, defer or stop — with the reasoning kept so a decision can be revisited."],
] as const;

const HOW = [
  ["Capture evidence", "Record each claim with its source, then score how credible, deep and recent it is."],
  ["Score and compare", "See value, evidence strength and priority for every opportunity in one portfolio."],
  ["Prove in 14 days", "Run a time-boxed proof of value with a named team and a clear end date."],
] as const;

const USE_CASES = [
  ["Finance and operations", "Processing, reconciliation and forecasting work that is manual today."],
  ["Customer and sales", "Support, proposals and knowledge assistants that sit close to customers."],
  ["Risk and IT", "Policy, contract and configuration analysis where accuracy matters."],
] as const;

const RESULTS = [
  ["A scored portfolio", "Opportunities ranked by value, evidence and priority, not by who argued loudest."],
  ["Evidence you can defend", "Each recommendation links back to the sources behind it."],
  ["Reports for stakeholders", "Executive summaries and data exports built from the same records."],
] as const;

const STARS: [number, number][] = [[430, 40], [520, 90], [600, 30], [700, 70], [780, 28], [860, 52], [1090, 36], [1160, 90], [1130, 170], [470, 150], [560, 220], [1180, 260]];

/** The night mountain: a faceted rocky peak under a flag, a haze of light, and the dashed path the five steps climb. */
function MountainArt() {
  return (
    <svg
      className="hero-art"
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label="A mountain path with five steps climbing it: Discover, Reason, Prove, Decide, Learn"
      preserveAspectRatio="xMaxYMid slice"
    >
      <defs>
        <linearGradient id="art-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" className="art-stop-sky-top" />
          <stop offset="1" className="art-stop-sky-bottom" />
        </linearGradient>
        <radialGradient id="art-halo" cx="0.82" cy="0.18" r="0.5">
          <stop offset="0" className="art-stop-glow" stopOpacity="0.6" />
          <stop offset="1" className="art-stop-glow" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="art-mist" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" className="art-stop-glow" stopOpacity="0" />
          <stop offset="1" className="art-stop-glow" stopOpacity="0.4" />
        </linearGradient>
        <linearGradient id="art-fade" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" className="art-stop-sky-top" stopOpacity="0.95" />
          <stop offset="0.5" className="art-stop-sky-top" stopOpacity="0.55" />
          <stop offset="0.75" className="art-stop-sky-top" stopOpacity="0" />
        </linearGradient>
      </defs>
      <rect width={W} height={H} fill="url(#art-sky)" />
      <rect width={W} height={H} fill="url(#art-halo)" />
      {STARS.map(([x, y]) => (
        <circle key={`${x}-${y}`} cx={x} cy={y} r="1.3" className="art-star" />
      ))}
      <polygon className="art-ridge-far" points="360,560 360,330 450,296 540,338 630,262 720,322 800,272 890,332 960,300 1080,350 1200,300 1200,560" />
      <polygon className="art-ridge-mid" points="520,560 520,440 610,372 690,408 760,318 850,248 925,170 990,70 1050,152 1112,232 1170,300 1200,330 1200,560" />
      <polygon className="art-facet art-facet--lit" points="990,70 925,170 960,205 1000,150" />
      <polygon className="art-facet art-facet--lit2" points="925,170 850,248 905,262 960,205" />
      <polygon className="art-facet art-facet--shade" points="990,70 1050,152 1010,172 1000,150" />
      <polygon className="art-facet art-facet--shade2" points="1050,152 1112,232 1060,246 1010,172" />
      <polygon className="art-ridge-shade" points="1000,150 1010,172 1060,246 1112,232 1170,300 1200,330 1200,560 930,560 960,380 990,260" />
      <polygon className="art-ridge-lit" points="760,318 850,248 905,262 880,330 820,372 700,420 690,408" />
      <polygon className="art-snow" points="990,70 955,126 975,119 990,138 1008,113 1030,122 1040,132 1050,152 1010,138" />
      <polyline className="art-crack" points="990,138 975,200 940,270 880,330" />
      <polyline className="art-crack" points="1008,113 1030,200 1070,260 1112,232" />
      <line className="art-flag-pole" x1="990" y1="70" x2="990" y2="30" />
      <polygon className="art-flag" points="990,30 1022,40 990,52" />
      <rect y="320" width={W} height="240" fill="url(#art-mist)" />
      <polygon className="art-ridge-near" points="0,560 0,505 300,472 520,508 760,482 1000,512 1200,488 1200,560" />
      <rect width={W} height={H} fill="url(#art-fade)" />
      <path
        className="art-path"
        d={`M${NODES.Discover} C 660 260, 675 320, ${NODES.Reason} S 800 470, ${NODES.Decide} S 905 260, ${NODES.Prove} S 975 110, 990 78`}
      />
      <path className="art-path" d={`M${NODES.Decide} C 960 430, 1030 425, ${NODES.Learn}`} />
      {Object.entries(NODES).map(([name, [x, y]]) => (
        <g key={name}>
          <circle cx={x} cy={y} r="22" className={`art-halo art-halo--${NODE_CLASS[name]}`} />
          <circle cx={x} cy={y} r="11" className={`art-node art-node--${NODE_CLASS[name]}`} />
        </g>
      ))}
    </svg>
  );
}

export default function Landing() {
  return (
    <div className="site" data-surface="site">
      <header className="site__header">
        <span className="site__brand">
          <BrandMark />
          {PRODUCT_NAME}
        </span>
        <nav className="site__nav" aria-label="On this page">
          <a href="#why">Why {PRODUCT_NAME}</a>
          <a href="#how">How it works</a>
          <a href="#use-cases">Use cases</a>
          <a href="#results">Results</a>
        </nav>
        <span className="site__header-actions">
          <Link to="/sign-in" className="site__link">
            Sign in
          </Link>
          {/* No booking backend exists — shown as unavailable rather than a dead link. */}
          <Button disabled aria-label="Book a demo — not yet available">
            Book a demo
          </Button>
        </span>
      </header>

      <main className="site__main">
        <section className="hero" aria-labelledby="hero-heading">
          <MountainArt />
          <ol className="journey-labels">
            {JOURNEY.map(({ name, text }) => {
              const [x, y] = NODES[name];
              return (
                <li key={name} className="journey-label" style={{ left: `${(x / W) * 100}%`, top: `${(y / H) * 100}%` }}>
                  <strong>{name}</strong>
                  <span>{text}</span>
                </li>
              );
            })}
          </ol>
          <div className="hero__copy">
            <h1 id="hero-heading" className="hero__title">
              Turn AI potential into <span className="hero__accent">measurable business value.</span>
            </h1>
            <p className="site__lead">
              A practical, evidence-based framework to discover, validate and scale AI opportunities — using a fail-fast
              approach.
            </p>
            <div className="site__actions">
              <Button variant="primary" disabled aria-label="Book a demo — not yet available">
                Book a demo (coming soon)
              </Button>
              <Link to="/sign-in" className="site__link">
                Sign in to your workspace →
              </Link>
            </div>
          </div>
          <ul className="strip" aria-label="What sets it apart">
            {STRIP.map((item) => (
              <li key={item.name} className="strip__item">
                <span className="strip__icon">{item.icon}</span>
                <span>
                  <strong>{item.name}</strong>
                  <br />
                  {item.text}
                </span>
              </li>
            ))}
          </ul>
        </section>

        <Section id="why" title={`Why teams use ${PRODUCT_NAME}`} items={WHY} />
        <Section id="how" title="How it works" items={HOW} numbered />
        <Section id="use-cases" title="Use cases" items={USE_CASES} />
        <Section id="results" title="What you get" items={RESULTS} />
      </main>
    </div>
  );
}

function Section({ id, title, items, numbered }: { id: string; title: string; items: readonly (readonly [string, string])[]; numbered?: boolean }) {
  return (
    <section id={id} aria-labelledby={`${id}-heading`}>
      <h2 id={`${id}-heading`}>{title}</h2>
      <ul className="tiles">
        {items.map(([name, text], i) => (
          <li key={name} className="tile">
            {numbered && (
              <span className="tile__num" aria-hidden="true">
                {i + 1}
              </span>
            )}
            <strong>{name}</strong>
            <span className="tile__text">{text}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
