import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { eq, sql } from "drizzle-orm";
import { getDb } from "@/app/db";
import { accounts, sessions, users, verificationTokens, workspaceInvitations, workspaceMembers } from "@/app/db/schema";
import { publishWorkspaceEvent } from "@/app/api/_pusher";

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
  ],
  trustHost: true,
  callbacks: {
    async signIn({ user }) {
      if (!user.id || !user.email) return false;

      const email = user.email.trim().toLowerCase();
      const role = adminEmails.has(email) ? "ADMIN" : undefined;
      const [existingUser] = await getDb()
        .select({ name: users.name, image: users.image })
        .from(users)
        .where(eq(users.id, user.id))
        .limit(1);
      await getDb()
        .update(users)
        .set({
          ...(user.name && !existingUser?.name ? { name: user.name } : {}),
          ...(user.image && !existingUser?.image?.startsWith("data:image/") ? { image: user.image } : {}),
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
  events: {
    async signIn({ user }) {
      const userId = user.id;
      const userEmail = user.email;
      if (!userId || !userEmail) return;
      const email = userEmail.trim().toLowerCase();
      const db = getDb();
      const invitations = await db.select({ workspaceId: workspaceInvitations.workspaceId })
        .from(workspaceInvitations)
        .where(sql`lower(${workspaceInvitations.email}) = ${email}`);
      if (!invitations.length) return;
      await db.insert(workspaceMembers)
        .values(invitations.map(({ workspaceId }) => ({ workspaceId, userId })))
        .onConflictDoNothing();
      await db.delete(workspaceInvitations)
        .where(sql`lower(${workspaceInvitations.email}) = ${email}`);
      for (const workspaceId of new Set(invitations.map(({ workspaceId }) => workspaceId))) {
        await publishWorkspaceEvent(workspaceId, "workspace:updated", {});
      }
    },
  },
});
