import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { login } from "../../api";
import { Button, InlineAlert, TextField } from "../../components/ui";
import { PRODUCT_NAME } from "../../brand";
import "./site.css";

export interface SignInProps {
  onSuccess: () => void;
}

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
      <main className="site__main site__main--narrow">
        <div className="signin-card">
          <h1 className="site__brand">
            <span className="site__mark" aria-hidden="true" />
            {PRODUCT_NAME}
          </h1>
          <div>
            <h2>Welcome back</h2>
            <p className="site__lead">Sign in to your workspace.</p>
          </div>
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
      </main>
    </div>
  );
}
