import { useQuery } from "@tanstack/react-query";
import { Link, useLocalSearchParams } from "expo-router";
import { Pressable, Text } from "react-native";
import { MESSAGES } from "@supplies/core/messages";
import type { InviteHousehold } from "@supplies/core/contracts/auth";
import { api } from "@/lib/api/client";
import { Spinner } from "@/components/ui/feedback";
import { AuthShell } from "@/components/auth/auth-shell";
import { RegisterForm } from "@/components/auth/register-form";

/**
 * «Приєднатися» — reached from an invite link, which on a phone arrives as a
 * deep link into the `supplies://` scheme.
 *
 * The household's name is fetched **before** the form is offered, because
 * «Приєднатися до «Наша родина»» and «Приєднатися» are different questions:
 * the first can be answered, the second is a leap of faith. Holding the
 * single-use token is the authorisation for that name — which is why
 * `GET /auth/invite/:token` is public, and why it 404s the moment the token is
 * spent.
 */
export default function JoinScreen() {
  const { token = "" } = useLocalSearchParams<{ token: string }>();

  const invite = useQuery({
    queryKey: ["invite", token],
    queryFn: () =>
      api.get<InviteHousehold>(`/api/auth/invite/${encodeURIComponent(token)}`),
    // A dead invite is an answer, not a network blip worth retrying.
    retry: false,
  });

  if (invite.isPending) {
    return (
      <AuthShell title="Запрошення">
        <Spinner label="Перевіряємо запрошення…" />
      </AuthShell>
    );
  }

  if (invite.isError || !invite.data) {
    return (
      <AuthShell
        title="Запрошення недійсне"
        subtitle={MESSAGES["auth.inviteInvalid"]}
        footer={
          <Link href="/login" asChild>
            <Pressable className="active:opacity-60">
              <Text className="text-sm text-primary underline">До входу</Text>
            </Pressable>
          </Link>
        }
      >
        <Text className="text-sm text-muted-foreground">
          Попросіть когось із родини створити нове посилання в налаштуваннях.
        </Text>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title={`Приєднатися до «${invite.data.householdName}»`}
      subtitle="Ви бачитимете й редагуватимете спільні запаси родини."
    >
      <RegisterForm inviteToken={token} />
    </AuthShell>
  );
}
