import NextAuth from "next-auth";
import Apple from "next-auth/providers/apple";
import Google from "next-auth/providers/google";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { eq } from "drizzle-orm";
import { getDb } from "@/app/db";
import { accounts, sessions, users, verificationTokens } from "@/app/db/schema";

const adminEmails = new Set(
  (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean),
);

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: DrizzleAdapter(getDb(), {
    usersTable: users,
    accountsTable: accounts,
    sessionsTable: sessions,
    verificationTokensTable: verificationTokens,
  }),
  providers: [
    Google({
      clientId: process.env.AUTH_GOOGLE_ID ?? "",
      clientSecret: process.env.AUTH_GOOGLE_SECRET ?? "",
    }),
    Apple({
      clientId: process.env.AUTH_APPLE_ID ?? "",
      clientSecret: process.env.AUTH_APPLE_SECRET ?? "",
    }),
  ],
  trustHost: true,
  callbacks: {
    async signIn({ user }) {
      if (!user.id || !user.email) return false;

      const email = user.email.trim().toLowerCase();
      const role = adminEmails.has(email) ? "ADMIN" : undefined;
      await getDb()
        .update(users)
        .set({
          ...(user.name ? { name: user.name } : {}),
          ...(user.image ? { image: user.image } : {}),
          ...(role ? { role } : {}),
        })
        .where(eq(users.id, user.id));

      if (role) user.role = role;
      return true;
    },
    session({ session, user }) {
      if (session.user) {
        session.user.id = user.id;
        session.user.role = user.role ?? "MEMBER";
      }
      return session;
    },
  },
});
