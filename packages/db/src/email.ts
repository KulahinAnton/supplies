/**
 * Thin, swappable email wrapper (Resend). Plain `fetch`, no SDK — the app
 * sends two kinds of mail (password reset, household invite) and a dependency
 * would not earn its place.
 *
 * Sending is best-effort by design: with no RESEND_API_KEY (the normal dev
 * case) this logs and reports failure, and callers must NOT surface that to
 * the user — telling a visitor "that address does not exist" is exactly the
 * user-enumeration leak the reset flow avoids.
 */

export type SendEmailInput = {
  to: string;
  subject: string;
  html: string;
};

export async function sendEmail({ to, subject, html }: SendEmailInput): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;

  if (!apiKey || !from) {
    console.warn(`[email] RESEND_API_KEY/EMAIL_FROM not set — skipped mail to ${to}`);
    return false;
  }

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from, to, subject, html }),
    });
    if (!response.ok) {
      console.error(`[email] Resend responded ${response.status}`);
      return false;
    }
    return true;
  } catch (error) {
    console.error("[email] send failed", error);
    return false;
  }
}

/**
 * Both links take the base URL as an argument rather than reading
 * `process.env.APP_URL` here.
 *
 * The Next app and the NestJS API are separate processes with separate
 * environments, and `createInvite` was already passing an `appUrl` that this
 * module then ignored — so an invite could return one link to the caller and
 * email a different one. The parameter makes that disagreement impossible to
 * express.
 */
export function passwordResetEmail(
  token: string,
  appUrl: string,
): { subject: string; html: string } {
  const link = `${appUrl}/reset-password?token=${encodeURIComponent(token)}`;
  return {
    subject: "Відновлення пароля — Запаси",
    html: `
      <p>Ви попросили відновити пароль.</p>
      <p><a href="${link}">Встановити новий пароль</a></p>
      <p>Посилання дійсне одну годину і спрацює лише один раз.
         Якщо ви цього не робили — просто проігноруйте цей лист.</p>
    `,
  };
}

export function inviteEmail(
  token: string,
  householdName: string,
  appUrl: string,
): { subject: string; html: string } {
  const link = `${appUrl}/join/${encodeURIComponent(token)}`;
  return {
    subject: `Запрошення до «${householdName}» — Запаси`,
    html: `
      <p>Вас запрошують вести спільні запаси родини «${householdName}».</p>
      <p><a href="${link}">Приєднатися</a></p>
      <p>Посилання дійсне 7 днів і спрацює лише один раз.</p>
    `,
  };
}
