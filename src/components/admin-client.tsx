"use client";
import { useActionState, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { addByUrl, deleteArticles, saveProfile, setTopic, syncStep } from "@/actions/admin";
import { TOPICS } from "@/lib/scrape";

const btn = "inline-flex h-9 items-center gap-2 rounded-md px-3.5 text-[14px] font-medium disabled:opacity-60";

/** Runs the importer in back-to-back ~50 s passes until there's nothing left to do. */
export function SyncButton() {
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const [stop, setStop] = useState(false);
  const stopRef = useStopRef(stop);

  async function run() {
    setRunning(true);
    setStop(false);
    setLog(["Checking the latest page of every author page…"]);
    let total = 0;
    try {
      for (let i = 0; i < 60; i++) {
        const r = await syncStep(i === 0);
        total += r.added;
        const line =
          `Pass ${i + 1}: +${r.added} articles (${total} total) · read ${r.pagesRead} listing pages, ${r.articlesRead} articles` +
          (r.queued || r.backfilling ? ` · ${r.queued} queued${r.backfilling ? `, ${r.backfilling} archive(s) still walking` : ""}` : "");
        setLog((l) => [...l, line, ...r.errors.map((e) => `  ⚠ ${e}`)]);
        router.refresh();
        if (r.done) {
          setLog((l) => [...l, "Done. Everything is up to date."]);
          break;
        }
        if (r.added === 0 && r.articlesRead === 0 && r.pagesRead === 0) {
          setLog((l) => [...l, "Stopped: nothing could be read this pass. Check the errors above, then try again later."]);
          break;
        }
        if (stopRef.current) {
          setLog((l) => [...l, "Paused. Press Sync now to carry on."]);
          break;
        }
      }
    } catch (e) {
      setLog((l) => [...l, `Error: ${e instanceof Error ? e.message : e}`]);
    } finally {
      setRunning(false);
      router.refresh();
    }
  }
  return (
    <div>
      <div className="flex gap-2">
        <button onClick={run} disabled={running} className={`${btn} bg-accent text-accent-fg hover:opacity-90`}>
          <RefreshCw size={15} className={running ? "animate-spin" : ""} /> {running ? "Syncing…" : "Sync now"}
        </button>
        {running && (
          <button onClick={() => setStop(true)} className={`${btn} border border-border hover:bg-hover`}>
            {stop ? "Pausing after this pass…" : "Pause"}
          </button>
        )}
      </div>
      {log.length > 0 && (
        <pre className="mt-3 max-h-64 overflow-auto whitespace-pre-wrap rounded-md bg-sunken p-3 text-[12px] leading-relaxed text-muted">
          {log.join("\n")}
        </pre>
      )}
    </div>
  );
}

function useStopRef(v: boolean) {
  const [ref] = useState(() => ({ current: false }));
  ref.current = v;
  return ref;
}

export function AddUrlForm() {
  const [state, action, pending] = useActionState(addByUrl, null);
  return (
    <form action={action} className="flex flex-col gap-2">
      <div className="flex gap-2">
        <input name="url" type="url" required placeholder="https://… link to an article the importer missed"
          className="h-9 min-w-0 flex-1 rounded-md border border-border bg-panel px-2.5 text-[14px] focus:border-accent focus:outline-none" />
        <button disabled={pending} className={`${btn} bg-accent text-accent-fg`}>{pending ? "Adding…" : "Add"}</button>
      </div>
      {state && <p className={`text-[13px] ${state.ok ? "text-ok" : "text-danger"}`}>{state.message}</p>}
    </form>
  );
}

export function TopicSelect({ id, value }: { id: string; value: string }) {
  const [pending, start] = useTransition();
  return (
    <select
      defaultValue={value}
      disabled={pending}
      onChange={(e) => start(() => setTopic(id, e.target.value))}
      className="h-8 rounded-md border border-border bg-panel px-1.5 text-[13px]"
    >
      {TOPICS.map((t) => <option key={t}>{t}</option>)}
    </select>
  );
}

export function DeleteButton({ id, title }: { id: string; title: string }) {
  const [pending, start] = useTransition();
  return (
    <button
      disabled={pending}
      onClick={() => {
        if (confirm(`Delete "${title}"? It won't be imported again.`)) start(() => deleteArticles([id]));
      }}
      className="text-[13px] text-danger hover:underline disabled:opacity-50"
    >
      Delete
    </button>
  );
}

type ProfileValues = {
  name: string; headline: string; bio: string; avatarUrl: string; location: string; email: string;
  links: { label: string; url: string }[]; authorNames: string[];
};

function L({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[12.5px] font-medium text-muted">{label}</span>
      {children}
      {hint && <span className="text-[12px] text-faint">{hint}</span>}
    </label>
  );
}

export function ProfileForm({ p }: { p: ProfileValues }) {
  const [state, action, pending] = useActionState(saveProfile, null);
  const field = "h-9 rounded-md border border-border bg-panel px-2.5 text-[14px] focus:border-accent focus:outline-none";
  return (
    <form action={action} className="flex max-w-[640px] flex-col gap-4">
      <L label="Name"><input name="name" defaultValue={p.name} required className={field} /></L>
      <L label="Headline"><input name="headline" defaultValue={p.headline} className={field} /></L>
      <L label="Bio"><textarea name="bio" defaultValue={p.bio} rows={5} className={`${field} h-auto py-2 leading-relaxed`} /></L>
      <L label="Photo URL" hint="A square photo works best, e.g. your headshot from an author page.">
        <input name="avatarUrl" defaultValue={p.avatarUrl} className={field} />
      </L>
      <div className="grid gap-4 sm:grid-cols-2">
        <L label="Location"><input name="location" defaultValue={p.location} className={field} /></L>
        <L label="Contact email (shown publicly)"><input name="email" type="email" defaultValue={p.email} className={field} /></L>
      </div>
      <L label="Links" hint="One per line: Label | https://…  (e.g. X | https://x.com/you)">
        <textarea name="links" rows={4} defaultValue={p.links.map((l) => `${l.label} | ${l.url}`).join("\n")}
          className={`${field} h-auto py-2 font-mono text-[13px]`} />
      </L>
      <L label="Byline names" hint="Comma-separated. An article is only imported if its byline contains one of these.">
        <input name="authorNames" defaultValue={p.authorNames.join(", ")} className={field} />
      </L>
      <div className="flex items-center gap-3">
        <button disabled={pending} className={`${btn} bg-accent text-accent-fg`}>{pending ? "Saving…" : "Save profile"}</button>
        {state && <span className={`text-[13px] ${state.ok ? "text-ok" : "text-danger"}`}>{state.message}</span>}
      </div>
    </form>
  );
}
