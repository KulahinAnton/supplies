import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthPageShell } from "@/components/auth-page-shell";
import { LoginForm } from "@/components/login-form";
import { validSessionOrNull } from "@/lib/auth-guard";

export default async function LoginPage() {
  // validSessionOrNull, not the raw JWT: a token whose user was deleted would
  // otherwise bounce between /dashboard and /login forever.
  if (await validSessionOrNull()) redirect("/dashboard");

  return (
    <AuthPageShell
      title="Вхід"
      subtitle="Запаси вашої родини — що є, що закінчується, що псується."
      footer={
        <>
          Ще немає акаунта?{" "}
          <Link href="/register" className="text-primary underline-offset-4 hover:underline">
            Створити
          </Link>
          <span className="mx-2">·</span>
          <Link
            href="/forgot-password"
            className="text-primary underline-offset-4 hover:underline"
          >
            Забули пароль?
          </Link>
        </>
      }
    >
      <LoginForm />
    </AuthPageShell>
  );
}
