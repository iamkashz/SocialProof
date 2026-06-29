import { cn } from "@/lib/utils";
import {
  Activity,
  AlertTriangle,
  Check,
  ChevronDown,
  CircleAlert,
  FileWarning,
  Gauge,
  Github,
  Loader2,
  Network,
  ShieldAlert,
  UserCircle,
} from "lucide-react";
import { useEffect, useState } from "react";

const AGENT_META: Record<
  string,
  { label: string; icon: React.ComponentType<{ className?: string }>; description: string }
> = {
  breach_agent: {
    label: "Breach Agent",
    icon: ShieldAlert,
    description: "Known data breaches via XposedOrNot",
  },
  github_agent: {
    label: "GitHub Agent",
    icon: Github,
    description: "Public commits and user profile metadata",
  },
  gravatar_agent: {
    label: "Gravatar Agent",
    icon: UserCircle,
    description: "Gravatar profile lookup",
  },
  paste_agent: {
    label: "Paste Leaks Agent",
    icon: FileWarning,
    description: "Paste sites, public leaks, and darknet via IntelligenceX",
  },
  account_enum_agent: {
    label: "Account Enum Agent",
    icon: Network,
    description: "Account registrations across 100+ services (email + usernames)",
  },
  correlation_agent: {
    label: "Correlation Agent",
    icon: Gauge,
    description: "Risk score and prioritized recommendations",
  },
};

type RunState = "input-available" | "output-available" | "output-error";

export type AgentRun = {
  id: string;
  state: RunState;
  input?: unknown;
  output?: unknown;
  /**
   * The raw ADK tool name (e.g. `github_lookup` vs `github_profile_lookup`).
   * Multiple raw tools can map to the same logical agent label; we surface
   * the raw name as a per-run subtitle so the user can tell them apart.
   */
  rawToolName: string;
};

type Status = "running" | "done" | "error" | "mixed";

function statusFromRuns(runs: AgentRun[]): Status {
  if (runs.some((r) => r.state !== "output-available" && r.state !== "output-error"))
    return "running";
  const hasError = runs.some((r) => r.state === "output-error" || (r.output as any)?.error);
  const hasDone = runs.some((r) => r.state === "output-available");
  if (hasError && hasDone) return "mixed";
  if (hasError) return "error";
  return "done";
}

function runSubject(run: AgentRun): string {
  if (run.input && typeof run.input === "object") {
    const o = run.input as Record<string, unknown>;
    if (typeof o.username === "string") return `@${o.username}`;
    if (typeof o.email === "string") return o.email;
    if (typeof o.domain === "string") return o.domain;
  }
  return run.rawToolName;
}

export function GroupedAgentCard({
  toolName,
  runs,
  renderRun,
  hasFindings = false,
}: {
  toolName: string;
  runs: AgentRun[];
  renderRun: (run: AgentRun) => React.ReactNode;
  /**
   * When true, the panel auto-expands once results arrive — pulls the
   * user's attention to panels that actually found something while
   * leaving empty panels collapsed.
   */
  hasFindings?: boolean;
}) {
  const meta = AGENT_META[toolName] ?? {
    label: toolName,
    icon: Activity,
    description: "Agent step",
  };
  const Icon = meta.icon;
  const status = statusFromRuns(runs);
  // Auto-open panels with findings on the transition from streaming →
  // done. Track userToggled so manual collapses stick.
  const [open, setOpen] = useState(false);
  const [userToggled, setUserToggled] = useState(false);
  useEffect(() => {
    if (userToggled) return;
    if (status === "done" || status === "mixed") {
      setOpen(hasFindings);
    }
  }, [status, hasFindings, userToggled]);

  return (
    <div
      className={cn(
        "rounded-xl border border-border bg-card/80 backdrop-blur transition",
        status === "running" && "scanline border-primary/40",
        status === "error" && "border-destructive/40",
        status === "mixed" && "border-warning/40",
      )}
    >
      <button
        type="button"
        onClick={() => {
          setUserToggled(true);
          setOpen((o) => !o);
        }}
        className="flex w-full items-center gap-3 p-4 text-left"
      >
        <div
          className={cn(
            "grid h-9 w-9 shrink-0 place-items-center rounded-md",
            status === "running" && "bg-primary/15 text-primary",
            status === "done" && "bg-success/15 text-success",
            status === "error" && "bg-destructive/15 text-destructive",
            status === "mixed" && "bg-warning/15 text-warning",
          )}
        >
          <Icon className="h-4 w-4" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <div className="font-medium">{meta.label}</div>
            <StatusPill status={status} count={runs.length} />
          </div>
          <div className="mt-0.5 truncate text-xs text-muted-foreground">
            {runs.length === 1
              ? runSubject(runs[0])
              : `${runs.length} runs · ${runs.map(runSubject).slice(0, 3).join(", ")}${runs.length > 3 ? "…" : ""}`}
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
        <div className="border-t border-border/60 bg-background/40">
          {runs.map((run, idx) => (
            <div key={run.id} className={cn("p-4", idx > 0 && "border-t border-border/40")}>
              {runs.length > 1 && (
                <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="font-mono">{run.rawToolName}</span>
                  <span>·</span>
                  <span>{runSubject(run)}</span>
                </div>
              )}
              {run.state === "input-available" ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin" /> Querying source…
                </div>
              ) : (run.output as any)?.error ? (
                <div className="flex items-start gap-2 text-sm text-destructive">
                  <CircleAlert className="h-4 w-4 shrink-0" />
                  <span>{String((run.output as any).error)}</span>
                </div>
              ) : (
                renderRun(run)
              )}
            </div>
          ))}
        </div>
      )}
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
        <AlertTriangle className="h-2.5 w-2.5" /> Error{countLabel}
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
