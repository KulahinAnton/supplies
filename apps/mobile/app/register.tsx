import { Link } from "expo-router";
import { Pressable, Text } from "react-native";
import { AuthShell } from "@/components/auth/auth-shell";
import { RegisterForm } from "@/components/auth/register-form";

/**
 * «Створити акаунт».
 *
 * Registration creates a NEW household with its own categories and storage
 * places. Joining an existing one is the other door — `/join/[token]` — and
 * that one needs a link somebody in the family made.
 */
export default function RegisterScreen() {
  return (
    <AuthShell
      title="Створити акаунт"
      subtitle="Нова родина зі своїми категоріями й місцями зберігання."
      footer={
        <Link href="/login" asChild>
          <Pressable className="active:opacity-60">
            <Text className="text-sm text-primary underline">
              Уже маєте акаунт? Увійти
            </Text>
          </Pressable>
        </Link>
      }
    >
      <RegisterForm />
    </AuthShell>
  );
}
