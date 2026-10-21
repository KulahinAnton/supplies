import { Link, Navigate, useSearchParams } from "react-router";
import { useAuth } from "../auth/auth-context";
import { AuthPageShell } from "../components/auth-page-shell";
import { RegisterForm } from "../components/auth/register-form";

/**
 * «Створити акаунт» — the counterpart of `apps/web/app/register/page.tsx`.
 *
 * A signed-in visitor is bounced, the same way the Next page redirects on
 * `validSessionOrNull()`. The invite token is read from the query string here
 * rather than the path: this route is reached from a link someone pasted, and
 * `/join/:token` is the one that owns the pretty URL.
 */
export function RegisterRoute() {
  const auth = useAuth();
  const [search] = useSearchParams();

  if (auth.status === "signed-in") return <Navigate to="/dashboard" replace />;

  return (
    <AuthPageShell
      title="Створити акаунт"
      subtitle="Нова родина зі своїми категоріями й місцями зберігання."
      footer={
        <>
          Уже маєте акаунт?{" "}
          <Link to="/login" className="text-primary underline-offset-4 hover:underline">
            Увійти
          </Link>
        </>
      }
    >
      <RegisterForm inviteToken={search.get("invite") ?? undefined} />
    </AuthPageShell>
  );
}
