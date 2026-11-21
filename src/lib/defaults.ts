import type { SourceKind } from "@/db/schema";

export const DEFAULT_SOURCES: { name: string; shortName: string; color: string; authorUrl: string; feedUrl?: string; kind: SourceKind }[] = [
  { name: "Android Police", shortName: "AP", color: "#e8590c", authorUrl: "https://www.androidpolice.com/author/sanuj-bhatia/", kind: "valnet" },
  { name: "Android Authority", shortName: "AA", color: "#1971c2", authorUrl: "https://www.androidauthority.com/author/sanujbhatia/", feedUrl: "https://www.androidauthority.com/author/sanujbhatia/feed/", kind: "aa" },
  { name: "Android Central", shortName: "AC", color: "#2f9e44", authorUrl: "https://www.androidcentral.com/author/sanuj-bhatia", kind: "future" },
  { name: "Tom's Guide", shortName: "TG", color: "#c2255c", authorUrl: "https://www.tomsguide.com/author/sanuj-bhatia", kind: "future" },
  { name: "TechRadar", shortName: "TR", color: "#5f3dc4", authorUrl: "https://www.techradar.com/author/sanuj-bhatia", kind: "future" },
  { name: "SoundGuys", shortName: "SG", color: "#f08c00", authorUrl: "https://www.soundguys.com/author/sanujbhatia/", kind: "aa" },
];

export const KIND_LABELS: Record<SourceKind, string> = {
  future: "Future (Android Central, Tom's Guide, TechRadar)",
  valnet: "Valnet (Android Police, Pocket-lint)",
  aa: "Android Authority / SoundGuys",
  generic: "Other site",
};
