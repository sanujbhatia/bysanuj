import { AuthError } from "next-auth";
import { redirect } from "next/navigation";
import { signIn } from "@/auth";

export const metadata = { title: "Sign in", robots: { index: false, follow: false } };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;

  async function login(formData: FormData) {
    "use server";
    try {
      await signIn("credentials", {
        email: String(formData.get("email") ?? ""),
        password: String(formData.get("password") ?? ""),
        redirectTo: "/admin",
      });
    } catch (e) {
      if (e instanceof AuthError) {
        const code = (e as AuthError & { code?: string }).code;
        redirect(`/login?error=${code === "too_many_attempts" ? "locked" : "invalid"}`);
      }
      throw e;
    }
  }

  return (
    <main className="flex min-h-dvh items-center justify-center p-4">
      <form action={login} className="w-full max-w-[340px] rounded-xl border border-border bg-panel p-6 shadow-sm">
        <h1 className="text-[18px] font-semibold tracking-tight">Portfolio admin</h1>
        <p className="mb-5 text-[13px] text-muted">Sign in to manage your portfolio.</p>
        {error && (
          <p role="alert" className="mb-3 rounded-md bg-sunken px-3 py-2 text-[13px] text-danger">
            {error === "locked"
              ? "Too many failed attempts. Try again in 15 minutes."
              : "That email and password don't match."}
          </p>
        )}
        <label className="mb-3 flex flex-col gap-1">
          <span className="text-[12px] font-medium text-muted">Email</span>
          <input name="email" type="email" required autoComplete="username" autoFocus
            className="h-9 rounded-md border border-border bg-panel px-2.5 text-[14px] focus:border-accent focus:outline-none" />
        </label>
        <label className="mb-5 flex flex-col gap-1">
          <span className="text-[12px] font-medium text-muted">Password</span>
          <input name="password" type="password" required autoComplete="current-password"
            className="h-9 rounded-md border border-border bg-panel px-2.5 text-[14px] focus:border-accent focus:outline-none" />
        </label>
        <button type="submit" className="h-9 w-full rounded-md bg-accent text-[14px] font-medium text-accent-fg hover:opacity-90">
          Sign in
        </button>
      </form>
    </main>
  );
}
