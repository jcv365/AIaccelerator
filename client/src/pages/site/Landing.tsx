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

/** Decorative-but-described illustration of the five-step path; the journey list below is the full text equivalent. */
function JourneyArt() {
  const xs = [30, 80, 130, 180, 230];
  return (
    <svg
      className="hero-art"
      viewBox="0 0 260 120"
      role="img"
      aria-label="Five connected steps: Discover, Reason, Prove, Decide, Learn"
    >
      <line className="hero-art__line" x1={xs[0]} y1="60" x2={xs[4]} y2="60" />
      {xs.map((x, i) => (
        <g key={x}>
          <circle className={`hero-art__node hero-art__node--${i + 1}`} cx={x} cy="60" r="12" />
          <text className="hero-art__num" x={x} y="64" textAnchor="middle">
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
        <Link to="/sign-in" className="site__link">
          Sign in
        </Link>
      </header>
      <main className="site__main">
        <section className="hero" aria-labelledby="hero-heading">
          <div className="hero__copy">
            <span className="hero__eyebrow">AI opportunity intelligence</span>
            <h1 id="hero-heading" className="hero__title">
              Know which AI opportunities are worth pursuing — and prove it.
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

        <section aria-labelledby="journey-heading">
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
      </main>
    </div>
  );
}
