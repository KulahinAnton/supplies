import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthPageShell } from "@/components/auth-page-shell";
import { RegisterForm } from "@/components/register-form";
import { inviteHouseholdName } from "@/lib/actions/auth";
import { validSessionOrNull } from "@/lib/auth-guard";
import { MESSAGES } from "@/lib/messages";

export default async function JoinPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  if (await validSessionOrNull()) redirect("/dashboard");

  const { token } = await params;
  const householdName = await inviteHouseholdName(token);

  if (!householdName) {
    return (
      <AuthPageShell
        title="Запрошення недійсне"
        subtitle={MESSAGES["auth.inviteInvalid"]}
        footer={
          <Link href="/login" className="text-primary underline-offset-4 hover:underline">
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
      title={`Приєднатися до «${householdName}»`}
      subtitle="Ви бачитимете й редагуватимете спільні запаси родини."
    >
      <RegisterForm inviteToken={token} />
    </AuthPageShell>
  );
}
