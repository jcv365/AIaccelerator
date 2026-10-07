import { useState, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { login } from "../../api";
import { Button, InlineAlert, TextField } from "../../components/ui";
import { BrandMark } from "../../components/BrandMark";
import { PRODUCT_NAME } from "../../brand";
import "./site.css";

export interface SignInProps {
  onSuccess: () => void;
}

const icon = (path: ReactNode) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {path}
  </svg>
);

const POINTS: { title: string; text: string; icon: ReactNode }[] = [
  { title: "Discover real opportunities", text: "and see the evidence behind each one.", icon: icon(<><path d="M12 3l9 16H3z" /><path d="M12 10v4M12 17h.01" /></>) },
  { title: "Validate with evidence", text: "and reduce risk before you commit.", icon: icon(<path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6z" />) },
  { title: "Turn pilots into measurable", text: "business outcomes, with decisions on record.", icon: icon(<><path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6z" /><path d="M9 12l2 2 4-4" /></>) },
];

export default function SignIn({ onSuccess }: SignInProps) {
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const ok = await login(username, password);
    setLoading(false);
    if (ok) {
      onSuccess();
      navigate("/app", { replace: true });
    } else {
      setError("Invalid username or password, or the server is unreachable");
    }
  }

  return (
    <div className="site" data-surface="site">
      <main className="signin">
        <section className="signin__brand" aria-label="About">
          <h1 className="site__brand site__brand--large">
            <BrandMark size={40} />
            {PRODUCT_NAME}
          </h1>
          <div className="signin__welcome">
            <h2>Welcome back</h2>
            <p className="site__lead">Sign in to continue to your {PRODUCT_NAME} workspace.</p>
          </div>
          <ul className="signin__points">
            {POINTS.map((p) => (
              <li key={p.title}>
                <span className="signin__point-icon">{p.icon}</span>
                <span>
                  <strong>{p.title}</strong>
                  <br />
                  {p.text}
                </span>
              </li>
            ))}
          </ul>
        </section>

        <div className="signin__panel" data-theme="light">
          <div className="signin-card">
            <div>
              <h2>Sign in</h2>
              <p className="signin-card__sub">Access your {PRODUCT_NAME} workspace.</p>
            </div>
            <form onSubmit={handleSubmit} className="site__form">
              <TextField
                label="Username"
                autoComplete="username"
                placeholder="your username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
              />
              <TextField
                label="Password"
                type="password"
                autoComplete="current-password"
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
              {error && <InlineAlert variant="error">{error}</InlineAlert>}
              <Button type="submit" variant="primary" disabled={loading}>
                {loading ? "Signing in…" : "Sign in"}
              </Button>
            </form>
            {/* Passwords are set by the administrator; there is no self-service reset to link to. */}
            <p className="site__note">Forgot your password? Ask your administrator.</p>
            <div className="site__divider">or continue with</div>
            {/* No OAuth integration exists anywhere in this codebase — rendered visibly unavailable, not a fake flow. */}
            <div className="site__sso">
              <Button disabled aria-label="Sign in with Microsoft — coming soon">
                <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="currentColor">
                  <rect x="3" y="3" width="8.5" height="8.5" />
                  <rect x="12.5" y="3" width="8.5" height="8.5" />
                  <rect x="3" y="12.5" width="8.5" height="8.5" />
                  <rect x="12.5" y="12.5" width="8.5" height="8.5" />
                </svg>
                Microsoft (coming soon)
              </Button>
              <Button disabled aria-label="Sign in with Google — coming soon">
                <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
                  <path d="M20 12h-8M19 8.5A8 8 0 1 0 19.5 15" />
                </svg>
                Google (coming soon)
              </Button>
            </div>
          </div>
          <p className="site__back">
            <Link to="/" className="site__link">
              ← Back to the home page
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
}
