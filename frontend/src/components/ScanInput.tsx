import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowRight, Loader2, Mail } from "lucide-react";

export function ScanInput({ autoFocus = false }: { autoFocus?: boolean }) {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    const trimmed = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setErr("Enter a valid email address.");
      return;
    }
    setBusy(true);
    const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    // Cache-bypass is available via `?fresh=1` on the scan URL directly —
    // intentionally not a UI affordance, since most visitors should get
    // the cached replay to keep latency low and API quota intact.
    navigate({
      to: "/scan/$id",
      params: { id },
      search: { email: trimmed },
    });
  }

  return (
    <form onSubmit={submit} className="w-full">
      <div className="group flex items-stretch gap-2 rounded-xl border border-border bg-surface/80 p-1.5 shadow-lg shadow-primary/5 focus-within:border-primary/60">
        <div className="grid place-items-center pl-3 text-muted-foreground">
          <Mail className="h-4 w-4" />
        </div>
        <input
          type="email"
          autoFocus={autoFocus}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          className="font-mono w-full bg-transparent px-2 py-2.5 text-base outline-none placeholder:text-muted-foreground/60"
        />
        <button
          type="submit"
          disabled={busy}
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:bg-primary/90 disabled:opacity-60"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
          Run scan
        </button>
      </div>
      {err ? <p className="mt-2 text-sm text-destructive">{err}</p> : null}
    </form>
  );
}
