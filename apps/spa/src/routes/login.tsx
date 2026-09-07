import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router";
import { MESSAGES, type MessageKey } from "@supplies/core/messages";
import { loginSchema } from "@supplies/core/validation/auth";
import { Button } from "@supplies/ui/button";
import { Input } from "@supplies/ui/input";
import { Label } from "@supplies/ui/label";
import { useAuth } from "../auth/auth-context";
import { AuthPageShell } from "../components/auth-page-shell";
import { ErrorNote } from "../components/feedback";

/**
 * «Вхід» — ported from `apps/web/components/login-form.tsx` inside
 * `AuthPageShell`.
 *
 * Validated with `loginSchema` from `@supplies/core/validation/auth`, the same
 * object the Next form resolves against and the same one the API checks the
 * request with. Its messages are KEYS, so they render through `MESSAGES` here
 * exactly as they do there — one catalogue, three clients (§8).
 *
 * `useState` rather than react-hook-form: the SPA has two fields and no reason
 * to carry a form library for them. That is a dependency difference, not a
 * behavioural one — the schema, the messages and the copy are identical.
 */
function messageFor(key?: string): string | undefined {
  if (!key) return undefined;
  return MESSAGES[key as MessageKey] ?? key;
}

export function LoginRoute() {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [issues, setIssues] = useState<{ email?: string; password?: string }>({});
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    // Checked here as well as on the server, with the same schema, so a typo
    // in an address is answered next to the field instead of after a round trip.
    const parsed = loginSchema.safeParse({ email, password });
    if (!parsed.success) {
      const next: { email?: string; password?: string } = {};
      for (const issue of parsed.error.issues) {
        const field = issue.path[0];
        if (field === "email" || field === "password") {
          next[field] ??= messageFor(issue.message);
        }
      }
      setIssues(next);
      return;
    }

    setIssues({});
    setBusy(true);
    try {
      await signIn(parsed.data.email, parsed.data.password);
      void navigate("/dashboard", { replace: true });
    } catch (cause) {
      setError(cause);
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthPageShell
      title="Вхід"
      subtitle="Той самий акаунт, що й у вебзастосунку та Telegram-боті."
      footer={
        <>
          Ще немає акаунта?{" "}
          <Link
            to="/register"
            className="text-primary underline-offset-4 hover:underline"
          >
            Створити
          </Link>
          <span className="mx-2">·</span>
          <Link
            to="/forgot-password"
            className="text-primary underline-offset-4 hover:underline"
          >
            Забули пароль?
          </Link>
        </>
      }
    >
      <form onSubmit={(e) => void submit(e)} className="space-y-4" noValidate>
        <div className="space-y-2">
          <Label htmlFor="email">Пошта</Label>
          <Input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            inputMode="email"
          />
          {issues.email ? (
            <p className="text-sm text-destructive">{issues.email}</p>
          ) : null}
        </div>

        <div className="space-y-2">
          <Label htmlFor="password">Пароль</Label>
          <Input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
          />
          {issues.password ? (
            <p className="text-sm text-destructive">{issues.password}</p>
          ) : null}
        </div>

        <ErrorNote error={error} />

        <Button type="submit" className="w-full" disabled={busy}>
          {busy ? "Входимо…" : "Увійти"}
        </Button>
      </form>
    </AuthPageShell>
  );
}
