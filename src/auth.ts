import NextAuth, { CredentialsSignin } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { and, eq, gt, count } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { loginAttempts, users } from "@/db/schema";
import { authConfig } from "./auth.config";

class TooManyAttempts extends CredentialsSignin {
  code = "too_many_attempts";
}

const MAX_FAILURES = 8;
const WINDOW_MS = 15 * 60 * 1000;

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: { email: {}, password: {} },
      async authorize(raw) {
        const parsed = z
          .object({ email: z.string().email().max(200), password: z.string().min(1).max(200) })
          .safeParse(raw);
        if (!parsed.success) return null;
        const email = parsed.data.email.toLowerCase();

        const [{ n }] = await db
          .select({ n: count() })
          .from(loginAttempts)
          .where(
            and(
              eq(loginAttempts.email, email),
              eq(loginAttempts.success, false),
              gt(loginAttempts.createdAt, new Date(Date.now() - WINDOW_MS)),
            ),
          );
        if (n >= MAX_FAILURES) throw new TooManyAttempts();

        const user = await db.query.users.findFirst({ where: eq(users.email, email) });
        // Compare against a dummy hash when the user doesn't exist to keep timing uniform.
        const ok = await bcrypt.compare(
          parsed.data.password,
          user?.passwordHash ?? "$2b$12$m1OPWCGWQoMN67aqkPvQKOUXURRPO/Iu3ZjmsIZ.m4b3S4zn9Jxw.",
        );
        await db.insert(loginAttempts).values({ email, success: !!(user && ok) });
        if (!user || !ok) return null;
        return { id: user.id, email: user.email, name: user.name };
      },
    }),
  ],
});
