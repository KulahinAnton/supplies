import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthPageShell } from "@/components/auth-page-shell";
import { ResetPasswordForm } from "@/components/password-reset-forms";
import { validSessionOrNull } from "@/lib/auth-guard";

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  if (await validSessionOrNull()) redirect("/dashboard");

  const { token } = await searchParams;

  if (!token) {
    return (
      <AuthPageShell
        title="Посилання неповне"
        footer={
          <Link href="/forgot-password" className="text-primary underline-offset-4 hover:underline">
            Надіслати нове
          </Link>
        }
      >
        <p className="text-sm text-muted-foreground">
          У посиланні немає коду відновлення.
        </p>
      </AuthPageShell>
    );
  }

  return (
    <AuthPageShell title="Новий пароль">
      <ResetPasswordForm token={token} />
    </AuthPageShell>
  );
}
