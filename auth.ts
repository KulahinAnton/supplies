import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";

/**
 * Auth.js v5, Credentials + JWT (PROJECT_PROMPT.md Feature 1).
 *
 * No DB adapter: the session is a JWT carrying `id` and `householdId`. That
 * makes `householdId` available to every server action without a lookup — but
 * it also means the token can outlive the row it describes, which is why
 * `requireSession()` (lib/auth-guard.ts) re-checks the user in the DB rather
 * than trusting these claims blindly.
 */
export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt", maxAge: 8 * 60 * 60 },
  pages: { signIn: "/login" },
  providers: [
    Credentials({
      credentials: {
        email: { label: "Пошта", type: "email" },
        password: { label: "Пароль", type: "password" },
      },
      async authorize(credentials) {
        const email = String(credentials?.email ?? "").trim().toLowerCase();
        const password = String(credentials?.password ?? "");
        if (!email || !password) return null;

        const user = await prisma.user.findUnique({ where: { email } });
        if (!user || !user.isActive) return null;

        const valid = await bcrypt.compare(password, user.passwordHash);
        if (!valid) return null;

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          householdId: user.householdId,
        };
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.id = user.id as string;
        token.householdId = user.householdId;
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        // next-auth v5 beta types the JWT loosely; the claims are set in the
        // `jwt` callback above and augmented in types/next-auth.d.ts.
        session.user.id = token.id as string;
        session.user.householdId = token.householdId as string;
      }
      return session;
    },
  },
});
