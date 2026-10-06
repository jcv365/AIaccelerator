import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { login } from "../../api";
import { Button, InlineAlert, TextField } from "../../components/ui";
import { PRODUCT_NAME } from "../../brand";
import "./site.css";

export interface SignInProps {
  onSuccess: () => void;
}

const POINTS = [
  "Every AI figure shows its model, date and reasoning.",
  "Claims are typed as fact, inference or assumption.",
  "Decisions are kept with the reasons behind them.",
] as const;

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
          <h1 className="site__brand">
            <span className="site__mark" aria-hidden="true" />
            {PRODUCT_NAME}
          </h1>
          <h2>Welcome back</h2>
          <p className="site__lead">Pick up where your opportunities left off.</p>
          <ul className="signin__points">
            {POINTS.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </section>

        <div className="signin__panel">
          <div className="signin-card">
            <h2>Sign in</h2>
            <form onSubmit={handleSubmit} className="site__form">
              <TextField
                label="Username"
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
              />
              <TextField
                label="Password"
                type="password"
                autoComplete="current-password"
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
            <div className="site__divider">or</div>
            {/* No OAuth integration exists anywhere in this codebase — rendered visibly unavailable, not a fake flow. */}
            <div className="site__sso">
              <Button disabled aria-label="Sign in with Microsoft — coming soon">
                Microsoft (coming soon)
              </Button>
              <Button disabled aria-label="Sign in with Google — coming soon">
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
