import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthPageShell } from "@/components/auth-page-shell";
import { ForgotPasswordForm } from "@/components/password-reset-forms";
import { validSessionOrNull } from "@/lib/auth-guard";

export default async function ForgotPasswordPage() {
  if (await validSessionOrNull()) redirect("/dashboard");

  return (
    <AuthPageShell
      title="Відновлення пароля"
      subtitle="Надішлемо посилання на вашу пошту."
      footer={
        <Link href="/login" className="text-primary underline-offset-4 hover:underline">
          Повернутися до входу
        </Link>
      }
    >
      <ForgotPasswordForm />
    </AuthPageShell>
  );
}
