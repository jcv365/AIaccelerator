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

export default function Landing() {
  return (
    <div className="site" data-surface="site">
      <header className="site__header">
        <span className="site__brand">{PRODUCT_NAME}</span>
        <Link to="/sign-in" className="site__link">
          Sign in
        </Link>
      </header>
      <main className="site__main">
        <h1>Know which AI opportunities are worth pursuing — and prove it.</h1>
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
            Sign in to your workspace
          </Link>
        </div>
        <section aria-labelledby="journey-heading">
          <h2 id="journey-heading">The path from idea to decision</h2>
          <ol className="site__journey">
            {JOURNEY.map(([name, text]) => (
              <li key={name}>
                <strong>{name}</strong>
                <span>{text}</span>
              </li>
            ))}
          </ol>
        </section>
      </main>
    </div>
  );
}
