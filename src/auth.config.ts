import type { NextAuthConfig } from "next-auth";

// Edge-safe config used by middleware. Providers live in auth.ts.
// Only /admin is private; the portfolio itself is public.
export const authConfig = {
  pages: { signIn: "/login" },
  session: { strategy: "jwt", maxAge: 60 * 60 * 24 * 30 },
  providers: [],
  callbacks: {
    authorized({ auth, request }) {
      const isLoggedIn = !!auth?.user;
      const { pathname } = request.nextUrl;
      if (pathname.startsWith("/login")) {
        if (isLoggedIn) return Response.redirect(new URL("/admin", request.nextUrl));
        return true;
      }
      if (pathname.startsWith("/admin")) return isLoggedIn;
      return true;
    },
    jwt({ token, user }) {
      if (user?.id) token.uid = user.id;
      return token;
    },
    session({ session, token }) {
      if (token.uid && session.user) session.user.id = token.uid as string;
      return session;
    },
  },
} satisfies NextAuthConfig;
