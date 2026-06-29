import { cn } from "@/lib/utils";
import {
  Activity,
  AlertTriangle,
  AtSign,
  Check,
  CircleAlert,
  FileWarning,
  Gauge,
  Github,
  Loader2,
  ShieldAlert,
  UserCircle,
} from "lucide-react";

const AGENT_META: Record<
  string,
  { label: string; icon: React.ComponentType<{ className?: string }> }
> = {
  breach_agent: { label: "Breach", icon: ShieldAlert },
  github_agent: { label: "GitHub", icon: Github },
  gravatar_agent: { label: "Gravatar", icon: UserCircle },
  username_enumeration_agent: { label: "Username Enum", icon: AtSign },
  paste_agent: { label: "Paste Leaks", icon: FileWarning },
  correlation_agent: { label: "Correlation", icon: Gauge },
};

type RunState = "input-available" | "output-available" | "output-error";

export type StatusRun = {
  state: RunState;
  output?: unknown;
  /** Original input.username/email for runs that aren't agent-default. */
  input?: unknown;
};

type Status = "running" | "done" | "error" | "mixed";

function statusFromRuns(runs: StatusRun[]): Status {
  if (runs.some((r) => r.state !== "output-available" && r.state !== "output-error"))
    return "running";
  const hasError = runs.some((r) => r.state === "output-error" || (r.output as any)?.error);
  const hasDone = runs.some((r) => r.state === "output-available");
  if (hasError && hasDone) return "mixed";
  if (hasError) return "error";
  return "done";
}

/**
 * One-line headline for the tile — what this agent actually found.
 * Hand-tuned per agent because each tool returns a different shape.
 */
function headlineForTile(toolName: string, runs: StatusRun[]): string {
  if (!runs.length) return "—";
  if (runs.some((r) => r.state === "input-available")) return "running…";

  switch (toolName) {
    case "breach_agent": {
      const o = runs[0]?.output as any;
      const n = o?.breachCount ?? 0;
      return n === 0 ? "no breaches" : `${n} breach${n === 1 ? "" : "es"}`;
    }
    case "github_agent": {
      // github_lookup (email) and github_profile_lookup (username) both map here.
      const usernames = new Set<string>();
      let profileLogin: string | null = null;
      for (const r of runs) {
        const o = r.output as any;
        for (const u of o?.usernames ?? []) usernames.add(u);
        if (o?.profile?.login) profileLogin = o.profile.login;
        if (o?.found && o?.profile?.login) profileLogin = o.profile.login;
      }
      if (profileLogin) return `@${profileLogin}`;
      if (usernames.size > 0) {
        const arr = Array.from(usernames);
        return arr.length === 1 ? `@${arr[0]}` : `${arr.length} usernames`;
      }
      return "no commits found";
    }
    case "gravatar_agent": {
      const o = runs[0]?.output as any;
      return o?.exists ? "profile found" : "no profile";
    }
    case "username_enumeration_agent": {
      let confirmed = 0;
      let scanned = 0;
      const usernames: string[] = [];
      for (const r of runs) {
        const o = r.output as any;
        confirmed += o?.existsCount ?? 0;
        scanned += o?.totalChecked ?? 0;
        if (o?.username) usernames.push(o.username);
      }
      if (scanned === 0) return "no candidates";
      return `${confirmed}/${scanned} on ${usernames.length} handle${usernames.length === 1 ? "" : "s"}`;
    }
    case "paste_agent": {
      const o = runs[0]?.output as any;
      const n = o?.hitCount ?? 0;
      return n === 0 ? "no paste hits" : `${n} hit${n === 1 ? "" : "s"}`;
    }
    case "correlation_agent": {
      const o = runs[0]?.output as any;
      if (o?.riskScore != null) return `score ${o.riskScore} · ${o.severity}`;
      return "computing…";
    }
    default:
      return "";
  }
}

export function AgentStatusTile({
  toolName,
  runs,
  href,
}: {
  toolName: string;
  runs: StatusRun[];
  /** Optional in-page anchor (#agent-<toolname>) for click-to-scroll. */
  href?: string;
}) {
  const meta = AGENT_META[toolName] ?? { label: toolName, icon: Activity };
  const Icon = meta.icon;
  const status = statusFromRuns(runs);
  const headline = headlineForTile(toolName, runs);

  const body = (
    <>
      <div className="flex items-center justify-between">
        <div
          className={cn(
            "grid h-9 w-9 place-items-center rounded-md",
            status === "running" && "bg-primary/15 text-primary",
            status === "done" && "bg-success/15 text-success",
            status === "error" && "bg-destructive/15 text-destructive",
            status === "mixed" && "bg-warning/15 text-warning",
          )}
        >
          <Icon className="h-4 w-4" />
        </div>
        <StatusPill status={status} count={runs.length} />
      </div>
      <div className="mt-3 font-medium text-sm">{meta.label} Agent</div>
      <div className="mt-0.5 truncate text-xs text-muted-foreground">{headline}</div>
    </>
  );

  if (href) {
    return (
      <a
        href={href}
        className={cn(
          "block rounded-xl border border-border bg-card/60 p-4 transition hover:border-primary/40 hover:bg-card/80",
          status === "running" && "scanline border-primary/40",
        )}
      >
        {body}
      </a>
    );
  }
  return (
    <div
      className={cn(
        "rounded-xl border border-border bg-card/60 p-4",
        status === "running" && "scanline border-primary/40",
      )}
    >
      {body}
    </div>
  );
}

function StatusPill({ status, count }: { status: Status; count: number }) {
  const countLabel = count > 1 ? ` · ${count}` : "";
  if (status === "running")
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-primary">
        <Loader2 className="h-2.5 w-2.5 animate-spin" /> Running{countLabel}
      </span>
    );
  if (status === "error")
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-destructive/15 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-destructive">
        <CircleAlert className="h-2.5 w-2.5" /> Error{countLabel}
      </span>
    );
  if (status === "mixed")
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-warning/15 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-warning">
        <AlertTriangle className="h-2.5 w-2.5" /> Partial{countLabel}
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-success/15 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-success">
      <Check className="h-2.5 w-2.5" /> Done{countLabel}
    </span>
  );
}
