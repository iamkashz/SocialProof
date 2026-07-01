import { cn } from "@/lib/utils";
import {
  Activity,
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  FileWarning,
  Gauge,
  Github,
  Loader2,
  Mail,
  Network,
  ShieldAlert,
  UserCircle,
} from "lucide-react";
import { useState } from "react";

const AGENT_META: Record<
  string,
  { label: string; icon: React.ComponentType<{ className?: string }>; description: string }
> = {
  breach_agent: {
    label: "Breach Agent",
    icon: ShieldAlert,
    description: "Checking known data breaches via XposedOrNot",
  },
  github_agent: {
    label: "GitHub Agent",
    icon: Github,
    description: "Searching public commits and user metadata",
  },
  gravatar_agent: {
    label: "Gravatar Agent",
    icon: UserCircle,
    description: "Looking up Gravatar profile for this email",
  },
  paste_agent: {
    label: "Paste Leaks Agent",
    icon: FileWarning,
    description: "Searching paste sites, public leaks, and darknet via IntelligenceX",
  },
  account_enum_agent: {
    label: "Account Enum Agent",
    icon: Network,
    description: "Probing 100+ services for account registrations across email and usernames",
  },
  correlation_agent: {
    label: "Correlation Agent",
    icon: Gauge,
    description: "Computing risk score and recommendations",
  },
};

type Status = "running" | "done" | "error";

export function AgentCard({
  toolName,
  state,
  input,
  output,
}: {
  toolName: string;
  state: string;
  input?: unknown;
  output?: unknown;
}) {
  const meta = AGENT_META[toolName] ?? {
    label: toolName,
    icon: Activity,
    description: "Agent step",
  };
  const Icon = meta.icon;
  const status: Status =
    state === "output-available" || state === "output-error"
      ? state === "output-error"
        ? "error"
        : "done"
      : "running";
  const [open, setOpen] = useState(false);

  const inputLabel = formatInputLabel(toolName, input);

  return (
    <div
      className={cn(
        "rounded-xl border border-border bg-card/80 backdrop-blur transition",
        status === "running" && "scanline border-primary/40",
        status === "error" && "border-destructive/40",
      )}
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-3 p-4 text-left"
      >
        <div
          className={cn(
            "grid h-9 w-9 shrink-0 place-items-center rounded-md",
            status === "running" && "bg-primary/15 text-primary",
            status === "done" && "bg-success/15 text-success",
            status === "error" && "bg-destructive/15 text-destructive",
          )}
        >
          <Icon className="h-4 w-4" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <div className="font-medium">{meta.label}</div>
            <StatusPill status={status} />
          </div>
          <div className="mt-0.5 truncate text-xs text-muted-foreground">
            {inputLabel || meta.description}
          </div>
        </div>
        <ChevronDown
          className={cn(
            "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
            open && "rotate-180",
          )}
        />
      </button>
      {open && (
        <div className="border-t border-border/60 bg-background/40 p-4">
          <AgentRender toolName={toolName} output={output} status={status} />
        </div>
      )}
    </div>
  );
}

function StatusPill({ status }: { status: Status }) {
  if (status === "running")
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-primary">
        <Loader2 className="h-2.5 w-2.5 animate-spin" /> Running
      </span>
    );
  if (status === "error")
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-destructive/15 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-destructive">
        <AlertTriangle className="h-2.5 w-2.5" /> Error
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-success/15 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-success">
      <Check className="h-2.5 w-2.5" /> Done
    </span>
  );
}

function formatInputLabel(toolName: string, input: unknown): string {
  if (!input || typeof input !== "object") return "";
  const o = input as Record<string, unknown>;
  if (typeof o.email === "string") return `target: ${o.email}`;
  if (typeof o.username === "string") return `username: ${o.username}`;
  if (typeof o.domain === "string") return `domain: ${o.domain}`;
  return "";
}

function AgentRender({
  toolName,
  output,
  status,
}: {
  toolName: string;
  output: unknown;
  status: Status;
}) {
  if (status === "running")
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" /> Querying source…
      </div>
    );
  if (!output) return <div className="text-sm text-muted-foreground">No output returned.</div>;
  const o = output as any;
  if (o.error)
    return (
      <div className="flex items-start gap-2 text-sm text-destructive">
        <CircleAlert className="h-4 w-4 shrink-0" />
        <span>{String(o.error)}</span>
      </div>
    );

  switch (toolName) {
    case "breach_agent":
      return <BreachRender data={o} />;
    case "github_agent":
      return <GithubRender data={o} />;
    case "gravatar_agent":
      return <GravatarRender data={o} />;
    case "paste_agent":
      return <PasteRender data={o} />;
    case "account_enum_agent":
      return <AccountEnumRender data={o} />;
    case "correlation_agent":
      return <CorrelationRender data={o} />;
    default:
      return (
        <pre className="max-h-72 overflow-auto rounded bg-background p-3 text-xs">
          {JSON.stringify(output, null, 2)}
        </pre>
      );
  }
}

function K({ children }: { children: React.ReactNode }) {
  return <span className="font-mono text-foreground">{children}</span>;
}

export function renderToolOutput(toolName: string, output: unknown): React.ReactNode {
  if (!output) return <div className="text-sm text-muted-foreground">No output returned.</div>;
  const o = output as any;
  if (o.error)
    return (
      <div className="flex items-start gap-2 text-sm text-destructive">
        <CircleAlert className="h-4 w-4 shrink-0" />
        <span>{String(o.error)}</span>
      </div>
    );
  switch (toolName) {
    case "breach_agent":
      return <BreachRender data={o} />;
    case "github_agent":
      return <GithubRender data={o} />;
    case "gravatar_agent":
      return <GravatarRender data={o} />;
    case "paste_agent":
      return <PasteRender data={o} />;
    case "account_enum_agent":
      return <AccountEnumRender data={o} />;
    case "correlation_agent":
      return <CorrelationRender data={o} />;
    default:
      return (
        <pre className="max-h-72 overflow-auto rounded bg-background p-3 text-xs">
          {JSON.stringify(output, null, 2)}
        </pre>
      );
  }
}

function BreachRender({ data }: { data: any }) {
  return (
    <div className="space-y-3">
      <div className="text-sm">
        Found <K>{data.breachCount}</K> breach{data.breachCount === 1 ? "" : "es"} exposing{" "}
        <K>{data.exposedDataClasses?.length ?? 0}</K> data classes.
      </div>
      {data.exposedDataClasses?.length ? (
        <div className="flex flex-wrap gap-1.5">
          {data.exposedDataClasses.map((c: string) => (
            <span
              key={c}
              className="rounded-md border border-warning/40 bg-warning/10 px-2 py-0.5 font-mono text-[11px] text-warning"
            >
              {c}
            </span>
          ))}
        </div>
      ) : null}
      {data.breaches?.length ? (
        <ul className="divide-y divide-border/60 rounded-md border border-border/60">
          {data.breaches.map((b: any) => (
            <li key={b.name} className="flex items-start justify-between gap-3 p-3 text-sm">
              <div>
                <div className="font-medium">{b.name}</div>
                <div className="text-xs text-muted-foreground">
                  {b.date} · {b.records?.toLocaleString() ?? "?"} records
                </div>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <div className="text-sm text-success">No breaches found.</div>
      )}
    </div>
  );
}

function GithubRender({ data }: { data: any }) {
  return (
    <div className="space-y-3">
      <div className="text-sm">
        <K>{data.commitCount}</K> commits · <K>{data.usernames?.length ?? 0}</K> username
        {data.usernames?.length === 1 ? "" : "s"} discovered
      </div>
      {data.usernames?.length ? (
        <div className="flex flex-wrap gap-1.5">
          {data.usernames.map((u: string) => (
            <span
              key={u}
              className="rounded-md border border-primary/40 bg-primary/10 px-2 py-0.5 font-mono text-[11px] text-primary"
            >
              @{u}
            </span>
          ))}
        </div>
      ) : null}
      {data.profile ? (
        <div className="rounded-md border border-border/60 p-3 text-sm">
          <div className="flex items-center gap-3">
            {data.profile.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={data.profile.avatarUrl}
                alt=""
                className="h-10 w-10 rounded-full border border-border"
              />
            ) : null}
            <div>
              <div className="font-medium">{data.profile.name ?? data.profile.login}</div>
              <div className="font-mono text-xs text-muted-foreground">@{data.profile.login}</div>
            </div>
          </div>
          {data.profile.bio ? <p className="mt-2 text-sm">{data.profile.bio}</p> : null}
          <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-muted-foreground sm:grid-cols-4">
            {data.profile.location ? (
              <Field label="Location" value={data.profile.location} />
            ) : null}
            {data.profile.company ? <Field label="Company" value={data.profile.company} /> : null}
            {data.profile.publicRepos != null ? (
              <Field label="Repos" value={String(data.profile.publicRepos)} />
            ) : null}
            {data.profile.createdAt ? (
              <Field label="Joined" value={new Date(data.profile.createdAt).toLocaleDateString()} />
            ) : null}
          </div>
        </div>
      ) : null}
      {data.recentCommits?.length ? (
        <div className="rounded-md border border-border/60">
          <div className="border-b border-border/60 px-3 py-2 text-xs uppercase tracking-wider text-muted-foreground">
            Recent commits
          </div>
          <ul className="max-h-48 divide-y divide-border/60 overflow-auto">
            {data.recentCommits.slice(0, 8).map((c: any) => (
              <li key={c.sha} className="px-3 py-2 text-xs">
                <span className="font-mono text-primary">{c.sha}</span>{" "}
                <span className="text-muted-foreground">{c.repo}</span>
                <div className="truncate">{c.message}</div>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function GravatarRender({ data }: { data: any }) {
  if (!data.exists)
    return <div className="text-sm text-muted-foreground">No Gravatar profile found.</div>;
  return (
    <div className="space-y-2 text-sm">
      <div className="flex items-center gap-3">
        {data.avatarUrl ? (
          <img
            src={data.avatarUrl}
            alt=""
            className="h-10 w-10 rounded-full border border-border"
          />
        ) : null}
        <div>
          <div className="font-medium">{data.displayName ?? data.preferredUsername}</div>
          <div className="font-mono text-xs text-muted-foreground">{data.profileUrl}</div>
        </div>
      </div>
      {data.aboutMe ? <p>{data.aboutMe}</p> : null}
      {data.location ? (
        <div className="text-xs text-muted-foreground">Location: {data.location}</div>
      ) : null}
      {data.accounts?.length ? (
        <div className="flex flex-wrap gap-1.5 pt-1">
          {data.accounts.map((a: any) => (
            <span
              key={a.shortname}
              className="rounded border border-border/60 px-2 py-0.5 font-mono text-[11px]"
            >
              {a.shortname}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function PasteRender({ data }: { data: any }) {
  const redactedCount = Number(data.redactedHitCount ?? 0);
  const redactedBuckets = (data.redactedBuckets ?? {}) as Record<string, number>;

  if (!data.hitCount) {
    // No visible paste hits. Two sub-cases: clean (also zero redacted)
    // shows the green "no hits" message; otherwise we show the leak-
    // database hits alone — never both, since "no hits found" + "N hits
    // found" reads as a contradiction to anyone who doesn't know the
    // internal bucket distinction.
    if (redactedCount === 0) {
      return <div className="text-sm text-success">No paste-site or leak hits found.</div>;
    }
    return (
      <div className="space-y-1.5 text-sm">
        <div className="text-warning">
          <K>{redactedCount}</K> hit{redactedCount === 1 ? "" : "s"} found in leak databases.
        </div>
        <div className="flex flex-wrap gap-1.5">
          {Object.entries(redactedBuckets).map(([bucket, count]) => (
            <span
              key={bucket}
              className="rounded-md border border-warning/40 bg-warning/10 px-2 py-0.5 font-mono text-[11px] text-warning"
            >
              {bucket} · {count}
            </span>
          ))}
        </div>
      </div>
    );
  }
  const buckets = (data.buckets ?? {}) as Record<string, number>;
  const hits = (data.hits ?? []) as Array<{
    bucket: string;
    bucket_label: string;
    title: string;
    date?: string;
    item_id?: string;
  }>;
  return (
    <div className="space-y-3">
      <div className="text-sm">
        Found <K>{data.hitCount}</K> mention{data.hitCount === 1 ? "" : "s"} across{" "}
        <K>{Object.keys(buckets).length}</K> source{Object.keys(buckets).length === 1 ? "" : "s"}.
      </div>
      {Object.keys(buckets).length ? (
        <div className="flex flex-wrap gap-1.5">
          {Object.entries(buckets).map(([bucket, count]) => (
            <span
              key={bucket}
              className="rounded-md border border-warning/40 bg-warning/10 px-2 py-0.5 font-mono text-[11px] text-warning"
            >
              {bucket} · {count}
            </span>
          ))}
        </div>
      ) : null}
      {redactedCount > 0 ? (
        <div className="space-y-1.5">
          <div className="text-xs text-muted-foreground">
            Plus <K>{redactedCount}</K> hit
            {redactedCount === 1 ? "" : "s"} in leak databases:
          </div>
          <div className="flex flex-wrap gap-1.5">
            {Object.entries(redactedBuckets).map(([bucket, count]) => (
              <span
                key={bucket}
                className="rounded-md border border-muted-foreground/40 bg-surface/40 px-2 py-0.5 font-mono text-[11px] text-muted-foreground"
              >
                {bucket} · {count}
              </span>
            ))}
          </div>
        </div>
      ) : null}
      {hits.length ? (
        <ul className="divide-y divide-border/60 rounded-md border border-border/60">
          {hits.slice(0, 10).map((h, i) => (
            <li key={h.item_id ?? i} className="p-3 text-sm">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className="rounded bg-surface/60 px-1.5 py-0.5 font-mono">
                  {h.bucket_label}
                </span>
                {h.date ? <span>{h.date.slice(0, 10)}</span> : null}
              </div>
              <div className="mt-1 truncate font-mono text-xs">{h.title}</div>
              {h.item_id ? (
                <a
                  href={`https://intelx.io/?did=${h.item_id}`}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-0.5 inline-block text-xs text-primary hover:underline"
                >
                  view on intelx.io →
                </a>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
      <p className="text-xs text-muted-foreground">
        SocialProof shows metadata only. Click through to intelx.io to inspect the actual record.
      </p>
    </div>
  );
}

/**
 * Single renderer for both account-discovery signals:
 *  - user-scanner email scan: `{ accounts: [{site_name, url, ...}], checkedCount, foundCount }`
 *  - username scan: `{ username, totalChecked, existsCount, platforms: [{platform, url, exists}] }`
 *
 * The two backend agents probe different join keys (email vs. username),
 * but the user-facing meaning is the same: "places this identity exists."
 * Rendered as the original 3-column tile grid, showing only platforms
 * where an account was found. With ~95 probes per scan, listing the
 * not-found ones would visually drown the signal; the header still
 * shows the X-of-Y count so the user knows the breadth of coverage.
 */
// Platform tiles link out only when the URL actually resolves to a
// useful public artifact. Two reasons a tile is NOT linkable:
//   1. The upstream returned only the site homepage (no per-user page),
//      which is what user-scanner does for email-keyed probes.
//   2. The platform has a per-user URL, but visiting it requires login,
//      returns a soft 404, or otherwise gives the visitor nothing —
//      those go on the denylist below.
// Match is case-insensitive against the platform / site_name string.
const _UNLINKABLE_PLATFORMS = new Set([
  "apple developer",
  "appledeveloper",
  "codecademy",
  "ifttt",
  "pinterest",
  "replit",
]);

function _shouldLink(label: string | undefined, url: string | undefined): boolean {
  if (!label || !url) return false;
  if (_UNLINKABLE_PLATFORMS.has(label.toLowerCase().trim())) return false;
  return true;
}

function AccountEnumRender({ data }: { data: any }) {
  const items: Array<{ label: string; url?: string; linkable: boolean }> = [];
  let identity: string | undefined;

  if (Array.isArray(data?.accounts)) {
    // user-scanner email-side shape. URLs here are usually site homepages
    // (no per-user profile URL from an email probe) — never linkable.
    for (const a of data.accounts) {
      if (!a?.site_name) continue;
      items.push({ label: a.site_name, url: a.url, linkable: false });
    }
  } else if (Array.isArray(data?.platforms)) {
    // Username-keyed shape. URLs point at a public profile page for the
    // discovered handle — linkable unless the platform is on the denylist.
    identity = data.username;
    for (const p of data.platforms) {
      if (!p?.exists || !p?.platform) continue;
      items.push({
        label: p.platform,
        url: p.url,
        linkable: _shouldLink(p.platform, p.url),
      });
    }
  }

  const found = items.length;

  if (!found) {
    return <div className="text-sm text-muted-foreground">No accounts found.</div>;
  }

  const baseTileClass =
    "flex items-center justify-between gap-2 rounded-md border border-success/40 bg-success/10 px-2.5 py-1.5 text-xs text-success";

  return (
    <div>
      <div className="mb-2 text-sm">
        {identity ? (
          <>
            <K>@{identity}</K> ·{" "}
          </>
        ) : null}
        <K>{found}</K> account{found === 1 ? "" : "s"} found
      </div>
      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
        {items.map((it) =>
          it.linkable && it.url ? (
            <a
              key={it.label + it.url}
              href={it.url}
              target="_blank"
              rel="noreferrer"
              className={`${baseTileClass} transition hover:bg-success/15`}
            >
              <span className="font-medium">{it.label}</span>
              <span className="font-mono">found</span>
            </a>
          ) : (
            <span key={it.label + (it.url ?? "")} className={baseTileClass}>
              <span className="font-medium">{it.label}</span>
              <span className="font-mono">found</span>
            </span>
          ),
        )}
      </div>
    </div>
  );
}

function CorrelationRender({ data }: { data: any }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-sm">
        <span className="font-mono">risk</span>
        <span className="font-mono text-lg text-primary">{data.riskScore}</span>
        <span className="text-muted-foreground">/ 100 · {data.severity}</span>
      </div>
      {data.attackChain ? <p className="text-sm text-foreground/90">{data.attackChain}</p> : null}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground/80">{label}</div>
      <div className="truncate text-foreground">{value}</div>
    </div>
  );
}

export { ChevronRight, Mail };
