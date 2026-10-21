import { useQuery } from "@tanstack/react-query";
import { Link, Navigate, useParams } from "react-router";
import { MESSAGES } from "@supplies/core/messages";
import { api } from "../api/client";
import { useAuth } from "../auth/auth-context";
import { AuthPageShell } from "../components/auth-page-shell";
import { RegisterForm } from "../components/auth/register-form";
import { Spinner } from "../components/feedback";

/**
 * «Приєднатися» — the counterpart of `apps/web/app/join/[token]/page.tsx`.
 *
 * The household's name is fetched before the form is offered, because
 * «Приєднатися до «Наша родина»» and «Приєднатися» are different questions:
 * the first one can be answered, the second is a leap of faith. Holding the
 * single-use token is the authorisation for that name — which is why
 * `GET /auth/invite/:token` is public and why it 404s the moment the token is
 * spent.
 */
export function JoinRoute() {
  const auth = useAuth();
  const { token = "" } = useParams();

  const invite = useQuery({
    queryKey: ["invite", token],
    queryFn: () =>
      api.get<{ householdName: string }>(`/api/auth/invite/${encodeURIComponent(token)}`),
    // A dead invite is an answer, not a network blip worth retrying.
    retry: false,
  });

  if (auth.status === "signed-in") return <Navigate to="/dashboard" replace />;

  if (invite.isPending) {
    return (
      <AuthPageShell title="Запрошення">
        <Spinner label="Перевіряємо запрошення…" />
      </AuthPageShell>
    );
  }

  if (invite.isError || !invite.data) {
    return (
      <AuthPageShell
        title="Запрошення недійсне"
        subtitle={MESSAGES["auth.inviteInvalid"]}
        footer={
          <Link to="/login" className="text-primary underline-offset-4 hover:underline">
            До входу
          </Link>
        }
      >
        <p className="text-sm text-muted-foreground">
          Попросіть когось із родини створити нове посилання в налаштуваннях.
        </p>
      </AuthPageShell>
    );
  }

  return (
    <AuthPageShell
      title={`Приєднатися до «${invite.data.householdName}»`}
      subtitle="Ви бачитимете й редагуватимете спільні запаси родини."
    >
      <RegisterForm inviteToken={token} />
    </AuthPageShell>
  );
}
