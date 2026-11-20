import Link from "next/link";
import { requireAdmin } from "@/server/session";
import { logout } from "@/actions/admin";

export const metadata = { title: "Admin", robots: { index: false, follow: false } };

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  const link = "rounded-md px-2.5 py-1.5 text-[14px] text-muted hover:bg-hover hover:text-text";
  return (
    <div className="mx-auto max-w-[1120px] px-4 pb-16 sm:px-6">
      <nav className="flex flex-wrap items-center gap-1 border-b border-border py-3">
        <span className="mr-3 font-serif text-[17px]">Portfolio admin</span>
        <Link href="/admin" className={link}>Overview</Link>
        <Link href="/admin/articles" className={link}>Articles</Link>
        <Link href="/admin/profile" className={link}>Profile</Link>
        <span className="flex-1" />
        <Link href="/" target="_blank" className={link}>View site ↗</Link>
        <form action={logout}><button className={link}>Sign out</button></form>
      </nav>
      <div className="pt-6">{children}</div>
    </div>
  );
}
