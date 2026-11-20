export function formatDate(iso: string | null, opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric" }) {
  if (!iso) return "";
  return new Intl.DateTimeFormat("en-GB", { ...opts, timeZone: "Asia/Kolkata" }).format(new Date(iso));
}
