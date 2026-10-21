import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      householdId: string;
    } & DefaultSession["user"];
  }

  interface User {
    householdId: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    householdId: string;
  }
}
