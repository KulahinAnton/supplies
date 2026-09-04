import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router";
import { useAuth } from "../auth/auth-context";
import { Button, ErrorNote } from "../components/ui";

/**
 * The web app's login form, ported. What changed is the submit: a server action
 * became a mutation against `/api/auth/login`, and the redirect is React
 * Router's rather than Next's.
 *
 * The copy is unchanged, and deliberately so — «Невірна пошта або пароль»
 * arrives from the API as a message key and renders identically here, because
 * both read one catalogue (PROJECT_PROMPT.md §8).
 */
export function LoginRoute() {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await signIn(email, password);
      void navigate("/", { replace: true });
    } catch (cause) {
      setError(cause);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={(e) => void submit(e)} className="mx-auto max-w-sm space-y-4 pt-10">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Вхід</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Той самий акаунт, що й у вебзастосунку та Telegram-боті.
        </p>
      </div>

      <label className="block space-y-1">
        <span className="text-sm font-medium">Пошта</span>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          required
          className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
        />
      </label>

      <label className="block space-y-1">
        <span className="text-sm font-medium">Пароль</span>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          required
          className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
        />
      </label>

      <ErrorNote error={error} />

      <Button type="submit" disabled={busy}>
        {busy ? "Входимо…" : "Увійти"}
      </Button>
    </form>
  );
}
