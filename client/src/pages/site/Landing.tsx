import { Link } from "react-router-dom";
import { Button } from "../../components/ui";
import { PRODUCT_NAME } from "../../brand";
import "./site.css";

const JOURNEY = [
  ["Discover", "Find where AI can create value in a client's business."],
  ["Reason", "Form a hypothesis and weigh the evidence behind it."],
  ["Prove", "Run a focused 14-day proof of value."],
  ["Decide", "Scale, defer or stop — with the reasoning on record."],
  ["Learn", "Keep what each experiment taught you."],
] as const;

const FEATURES = [
  ["Opportunity Portfolio", "Every opportunity with its value, evidence score and priority in one table."],
  ["Evidence Explorer", "Each claim with its source, and how credible, deep and recent it is."],
  ["Hypothesis Engine", "What you believe, why, and what would prove it wrong."],
  ["14-Day PoV Pipeline", "Time-boxed proofs of value, with days left and who is on them."],
  ["Reports & Exports", "Executive summaries and data exports built from the same records."],
] as const;

const WHY = [
  ["Evidence first", "Every claim is typed as fact, inference or assumption, so you can see how much rests on what."],
  ["Honest numbers", "An AI figure always says which model produced it, when, and why. Where nothing was assessed, it says so."],
  ["Decisions on record", "Scale, defer or stop — with the reasoning kept so a decision can be revisited."],
] as const;

// Ridge points the journey nodes sit on, climbing left to right.
const RIDGE: [number, number][] = [
  [50, 200],
  [140, 160],
  [230, 120],
  [320, 85],
  [410, 50],
];

/** A mountain ridge with the five journey steps climbing it. The numbers are drawn; the step names are in the list below. */
function JourneyArt() {
  return (
    <svg
      className="hero-art"
      viewBox="0 0 460 240"
      role="img"
      aria-label="A mountain path with five steps climbing it: Discover, Reason, Prove, Decide, Learn"
    >
      <polygon className="hero-art__far" points="0,240 0,150 70,110 130,150 200,90 280,150 350,100 460,170 460,240" />
      <polygon className="hero-art__near" points="0,240 0,200 140,160 230,120 320,85 410,50 460,70 460,240" />
      <polyline className="hero-art__path" points={RIDGE.map(([x, y]) => `${x},${y}`).join(" ")} />
      {RIDGE.map(([x, y], i) => (
        <g key={x}>
          <circle className={`hero-art__node hero-art__node--${i + 1}`} cx={x} cy={y} r="13" />
          <text className="hero-art__num" x={x} y={y + 4} textAnchor="middle">
            {i + 1}
          </text>
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
          <span className="site__mark" aria-hidden="true" />
          {PRODUCT_NAME}
        </span>
        <nav className="site__nav" aria-label="On this page">
          <a href="#why">Why</a>
          <a href="#how">How it works</a>
          <a href="#features">Features</a>
        </nav>
        <Link to="/sign-in" className="site__link">
          Sign in
        </Link>
      </header>
      <main className="site__main">
        <section className="hero" aria-labelledby="hero-heading">
          <div className="hero__copy">
            <span className="hero__eyebrow">AI opportunity intelligence</span>
            <h1 id="hero-heading" className="hero__title">
              Turn AI potential into measurable business value.
            </h1>
            <p className="site__lead">
              {PRODUCT_NAME} takes a client from first discovery to a proven, evidence-backed decision on every AI
              opportunity.
            </p>
            <div className="site__actions">
              {/* No booking backend exists — shown as unavailable rather than a dead link. */}
              <Button variant="primary" disabled aria-label="Book a demo — not yet available">
                Book a demo (coming soon)
              </Button>
              <Link to="/sign-in" className="site__link">
                Sign in to your workspace →
              </Link>
            </div>
          </div>
          <JourneyArt />
        </section>

        <section id="why" aria-labelledby="why-heading">
          <h2 id="why-heading">Why teams use it</h2>
          <ul className="tiles">
            {WHY.map(([name, text]) => (
              <li key={name} className="tile">
                <strong>{name}</strong>
                <span className="tile__text">{text}</span>
              </li>
            ))}
          </ul>
        </section>

        <section id="how" aria-labelledby="journey-heading">
          <h2 id="journey-heading">The path from idea to decision</h2>
          <ol className="journey">
            {JOURNEY.map(([name, text], i) => (
              <li key={name} className="journey__step">
                <span className="journey__num" aria-hidden="true">
                  {i + 1}
                </span>
                <strong>{name}</strong>
                <span className="journey__text">{text}</span>
              </li>
            ))}
          </ol>
        </section>

        <section id="features" aria-labelledby="features-heading">
          <h2 id="features-heading">What is in the workspace</h2>
          <ul className="tiles">
            {FEATURES.map(([name, text]) => (
              <li key={name} className="tile">
                <strong>{name}</strong>
                <span className="tile__text">{text}</span>
              </li>
            ))}
          </ul>
        </section>
      </main>
    </div>
  );
}
