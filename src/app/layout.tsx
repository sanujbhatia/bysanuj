import type { Metadata, Viewport } from "next";
import { getPublicData } from "@/server/public";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  let name = "Sanuj Bhatia";
  let headline = "Freelance tech journalist";
  let avatar = "";
  try {
    const { profile } = await getPublicData();
    if (profile) ({ name, headline, avatarUrl: avatar } = profile);
  } catch {}
  const title = `${name} · ${headline}`;
  const description = `Articles by ${name} across Android Police, Android Authority, Android Central, Tom's Guide, TechRadar and more.`;
  return {
    title: { default: title, template: `%s · ${name}` },
    description,
    openGraph: { title, description, type: "profile", images: avatar ? [avatar] : undefined },
    twitter: { card: "summary", title, description },
  };
}

export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
