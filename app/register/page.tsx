import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthPageShell } from "@/components/auth-page-shell";
import { RegisterForm } from "@/components/register-form";
import { validSessionOrNull } from "@/lib/auth-guard";

export default async function RegisterPage() {
  if (await validSessionOrNull()) redirect("/dashboard");

  return (
    <AuthPageShell
      title="Новий акаунт"
      subtitle="Створимо вашу родину — потім запросите решту."
      footer={
        <>
          Вже маєте акаунт?{" "}
          <Link href="/login" className="text-primary underline-offset-4 hover:underline">
            Увійти
          </Link>
        </>
      }
    >
      <RegisterForm />
    </AuthPageShell>
  );
}
