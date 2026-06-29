import { renderToolOutput } from "@/components/AgentCard";
import { GroupedAgentCard, type AgentRun } from "@/components/GroupedAgentCard";
import { RecommendationsPanel } from "@/components/RecommendationsPanel";
import { RiskGauge } from "@/components/RiskGauge";
import { SiteFooter, SiteHeader } from "@/components/SiteChrome";
import { SummaryRenderer } from "@/components/SummaryRenderer";
import { useAdkScan, type AgentPart } from "@/hooks/use-adk-scan";
import { Link, createFileRoute } from "@tanstack/react-router";
import { AlertTriangle, Download, Loader2, Mail, RotateCw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { z } from "zod";

const search = z.object({
  email: z.string().email(),
  // Optional dev flag set by the landing-page "Force new scan" checkbox.
  // Bypasses the daily cache. Remove before shipping.
  fresh: z.union([z.literal(1), z.literal("1")]).optional(),
});

export const Route = createFileRoute("/scan/$id")({
  validateSearch: (s) => search.parse(s),
  head: ({ params }) => ({
    meta: [
      { title: `Scan ${params.id} — SocialProof` },
      { name: "description", content: "Live OSINT investigation in progress." },
    ],
  }),
  component: ScanPage,
});

// ADK tool names → labels the existing AgentCard component already knows.
const TOOL_NAME_ALIAS: Record<string, string> = {
  breach_lookup: "breach_agent",
  github_lookup: "github_agent",
  github_profile_lookup: "github_agent",
  gravatar_lookup: "gravatar_agent",
  // Both account-discovery signals (the 100+ user-scanner email probes and
  // the 7-platform username enumerator) render under one combined panel.
  // The data sources are intentionally distinct internally — different
  // join keys, different state slots — but the UI collapses them so the
  // user sees one "account existence" card instead of two.
  username_enum: "account_enum_agent",
  user_scanner_lookup: "account_enum_agent",
  paste_search: "paste_agent",
  correlate_risk: "correlation_agent",
};

// Tools that exist for pipeline plumbing but produce no user-facing output.
// Their findings are surfaced indirectly (handle_discovery's handles end up
// in the account_enum panel after the next pivot iteration probes them).
const HIDDEN_TOOLS = new Set<string>(["handle_discovery"]);

// Map Python snake_case tool outputs into the camelCase keys AgentCard expects.
function adaptOutput(toolName: string, output: unknown): unknown {
  if (!output || typeof output !== "object") return output;
  const o = output as Record<string, unknown>;
  switch (toolName) {
    case "breach_lookup":
      return {
        breachCount: o.breach_count,
        exposedDataClasses: o.exposed_data_classes,
        breaches: o.breaches,
        error: o.error,
      };
    case "github_lookup": {
      const profile = o.profile as Record<string, unknown> | undefined;
      return {
        commitCount: o.commit_count,
        usernames: o.usernames,
        profile: profile
          ? {
              login: profile.login,
              name: profile.name,
              bio: profile.bio,
              location: profile.location,
              company: profile.company,
              publicRepos: profile.public_repos,
              createdAt: profile.created_at,
              avatarUrl: profile.avatar_url,
              htmlUrl: profile.html_url,
            }
          : undefined,
        recentCommits: o.recent_commits,
        error: o.error,
      };
    }
    case "gravatar_lookup":
      return {
        exists: o.exists,
        displayName: o.display_name,
        preferredUsername: o.preferred_username,
        profileUrl: o.profile_url,
        avatarUrl: o.avatar_url,
        aboutMe: o.about_me,
        location: o.location,
        accounts: o.accounts,
        error: o.error,
      };
    case "username_enum":
      return {
        username: o.username,
        existsCount: o.exists_count,
        totalChecked: o.total_checked,
        platforms: o.platforms,
        error: o.error,
      };
    case "paste_search":
      return {
        hitCount: o.hit_count,
        buckets: o.buckets,
        hits: o.hits,
        error: o.error,
      };
    case "user_scanner_lookup":
      return {
        checkedCount: o.checked_count,
        foundCount: o.found_count,
        accounts: o.accounts,
        errors: o.errors,
        error: o.error,
      };
    case "handle_discovery":
      return {
        newHandles: o.new_handles,
        knownHandles: o.known_handles,
        reason: o.reason,
        error: o.error,
      };
    case "correlate_risk":
      return {
        riskScore: o.risk_score,
        severity: o.severity,
        attackChain: o.attack_chain,
        remediations: o.remediations,
        error: o.error,
      };
    default:
      return output;
  }
}

function ScanPage() {
  const { id } = Route.useParams();
  const { email, fresh } = Route.useSearch();
  const { agentParts, assistantText, status, errorMessage, warningMessage, cachedAt } = useAdkScan(
    email,
    id,
    { forceFresh: Boolean(fresh) },
  );

  const isLoading = status === "streaming";

  const renderedParts = useMemo(
    () =>
      agentParts
        .filter((p) => !HIDDEN_TOOLS.has(p.toolName))
        .map((p) => ({
          ...p,
          renderedToolName: TOOL_NAME_ALIAS[p.toolName] ?? p.toolName,
          renderedOutput: adaptOutput(p.toolName, p.output),
        })),
    [agentParts],
  );

  // Group consecutive cards by logical agent label so the timeline shows one
  // "Username Enum Agent" card with N runs inside rather than N separate
  // cards. Order is preserved by the first-seen index of each group.
  const groupedParts = useMemo(() => {
    const order: string[] = [];
    const groups: Record<string, AgentRun[]> = {};
    for (const p of renderedParts) {
      const key = p.renderedToolName;
      if (!groups[key]) {
        groups[key] = [];
        order.push(key);
      }
      groups[key].push({
        id: p.id,
        state: p.state,
        input: p.input,
        output: p.renderedOutput,
        rawToolName: p.toolName,
      });
    }
    return order.map((key) => ({ toolName: key, runs: groups[key] }));
  }, [renderedParts]);

  const correlation = renderedParts.find(
    (p) => p.toolName === "correlate_risk" && p.state === "output-available",
  )?.renderedOutput as
    | {
        riskScore: number;
        severity: string;
        attackChain: string;
        remediations: Array<{ priority: number; title: string; detail: string }>;
      }
    | undefined;

  function downloadJson() {
    const blob = new Blob(
      [
        JSON.stringify(
          {
            email,
            scannedAt: new Date().toISOString(),
            agents: agentParts.map((p: AgentPart) => ({
              agent: p.toolName,
              status: p.state,
              input: p.input,
              output: p.output,
            })),
            summary: assistantText,
            risk: correlation,
          },
          null,
          2,
        ),
      ],
      { type: "application/json" },
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `socialproof-${email.replace(/[^a-z0-9]/gi, "_")}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto w-full max-w-6xl px-4 pb-16 pt-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-xs uppercase tracking-widest text-muted-foreground">
              Investigation target
            </div>
            <div className="mt-1 flex items-center gap-2 text-xl font-medium">
              <Mail className="h-4 w-4 text-primary" />
              <span className="font-mono">{email}</span>
            </div>
            {cachedAt ? (
              <div className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-surface/60 px-2 py-0.5 text-[11px] text-muted-foreground">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-primary" />
                Cached result from {new Date(cachedAt).toLocaleString()}
              </div>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => window.print()}
              className="inline-flex items-center gap-2 rounded-md border border-border bg-surface px-3 py-1.5 text-sm hover:bg-surface-2"
            >
              <Download className="h-3.5 w-3.5" />
              Print / PDF
            </button>
            <button
              onClick={downloadJson}
              className="inline-flex items-center gap-2 rounded-md border border-border bg-surface px-3 py-1.5 text-sm hover:bg-surface-2"
            >
              <Download className="h-3.5 w-3.5" />
              JSON
            </button>
            <Link
              to="/"
              className="inline-flex items-center gap-2 rounded-md border border-border bg-surface px-3 py-1.5 text-sm hover:bg-surface-2"
            >
              <RotateCw className="h-3.5 w-3.5" />
              New scan
            </Link>
          </div>
        </div>

        {errorMessage && (
          <div className="mt-6 flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <div className="font-medium">Scan failed</div>
              <div className="mt-0.5">{errorMessage}</div>
            </div>
          </div>
        )}

        {!errorMessage && warningMessage && (
          <div className="mt-6 flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/10 p-4 text-sm text-warning">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <div className="font-medium">Partial result</div>
              <div className="mt-0.5">{warningMessage}</div>
            </div>
          </div>
        )}

        {isLoading && !errorMessage && (
          <ScanProgressBanner agentParts={agentParts} cached={Boolean(cachedAt)} />
        )}

        {/* Row 1: Risk gauge | Executive summary ────────────────────
            Hidden until the correlation agent has produced a score.
            During the live scan the user sees the agent timeline grow;
            once the score lands and the narrator finishes, this row
            slides in at the top with the verdict. Equal-height so the
            gauge panel stretches to the summary's height. */}
        {correlation && assistantText && (
          <div className="mt-8 grid gap-6 lg:grid-cols-[360px_1fr]">
            <div className="flex items-center justify-center rounded-xl border border-border bg-card/80 p-5">
              <RiskGauge score={correlation.riskScore} severity={correlation.severity} />
            </div>
            <div className="rounded-xl border border-border bg-card/60 p-6">
              <div className="mb-3 text-xs uppercase tracking-widest text-muted-foreground">
                Executive summary
              </div>
              <SummaryRenderer markdown={assistantText} />
            </div>
          </div>
        )}

        {/* Row 2: Recommendations ──────────────────────────────────
            Surfaced as soon as the correlation lands so the action
            list is visible above the (still-relevant) audit trail.
            During the scan this slot is empty — the agent timeline
            below is what the user watches; once results arrive the
            remediation list slides in here ahead of the timeline. */}
        {correlation?.remediations?.length && assistantText ? (
          <div className="mt-8">
            <RecommendationsPanel recommendations={correlation.remediations} />
          </div>
        ) : null}

        {/* Row 3: Agent timeline ────────────────────────────────────
            Always visible. While the scan is running this is the
            user's primary feedback surface; once results land it stays
            as the audit trail beneath the executive summary and
            remediations. */}
        <div className="mt-8 rounded-xl border border-border bg-card/60 p-5">
          <div className="mb-3 flex items-center gap-2">
            <span className="text-xs uppercase tracking-widest text-muted-foreground">
              Agent timeline
            </span>
            {isLoading && (
              <span className="inline-flex items-center gap-1 text-xs text-primary">
                <Loader2 className="h-3 w-3 animate-spin" />
                investigating…
              </span>
            )}
          </div>
          <div className="space-y-3">
            {groupedParts.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border bg-surface/40 p-6 text-sm text-muted-foreground">
                Spinning up agents…
              </div>
            ) : (
              groupedParts.map((g) => (
                <GroupedAgentCard
                  key={g.toolName}
                  toolName={g.toolName}
                  runs={g.runs}
                  renderRun={(run) => renderToolOutput(g.toolName, run.output)}
                  hasFindings={groupHasFindings(g.toolName, g.runs)}
                />
              ))
            )}
          </div>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}

// Summary rendering lives in `@/components/SummaryRenderer` so /scan/$id and
// /sample stay in sync (both use the same severity-pill treatment).

/**
 * Whether a grouped panel has anything worth showing. Used to auto-expand
 * panels that found something while keeping empty ones collapsed.
 *
 * Per-tool predicates (rather than a single generic "non-empty output"
 * check) because each agent's "found something" signal is shape-specific:
 * breach_agent uses breachCount, github_agent uses commitCount, etc.
 */
function groupHasFindings(toolName: string, runs: AgentRun[]): boolean {
  return runs.some((r) => {
    const o = (r.output ?? {}) as Record<string, unknown>;
    if (!o || typeof o !== "object") return false;
    if (o.error) return false;

    switch (toolName) {
      case "breach_agent":
        return Number(o.breachCount ?? 0) > 0;
      case "github_agent":
        return Number(o.commitCount ?? 0) > 0 || Boolean(o.profile);
      case "gravatar_agent":
        return Boolean(o.exists);
      case "paste_agent":
        return Number(o.hitCount ?? 0) > 0;
      case "account_enum_agent": {
        // user-scanner shape: foundCount; username-enum shape: existsCount.
        const found = Number(o.foundCount ?? o.existsCount ?? 0);
        return found > 0;
      }
      case "correlation_agent":
        // Always expand the verdict.
        return true;
      default:
        return false;
    }
  });
}

/**
 * Always-on progress banner shown while the scan is streaming. Solves the
 * "page feels hung" symptom during the long-running user-scanner account
 * enumeration (~30s per identity probed): even when no individual agent
 * card has just changed, the banner keeps moving via an elapsed-time
 * counter and a phase label derived from which tool outputs have arrived.
 *
 * Phases are inferred from the agent_parts stream, not the backend —
 * the backend doesn't emit phase events, but the order of tool_call
 * arrivals is deterministic enough to map cleanly.
 */
function ScanProgressBanner({ agentParts, cached }: { agentParts: AgentPart[]; cached: boolean }) {
  const elapsed = useElapsedSeconds(cached);

  const phase = useMemo(() => phaseFromParts(agentParts), [agentParts]);

  return (
    <div className="mt-6 rounded-lg border border-primary/40 bg-primary/10 p-4">
      <div className="flex items-center gap-3">
        <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary" />
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2">
            <div className="text-sm font-medium text-primary">{phase.label}</div>
            <div className="font-mono text-xs text-muted-foreground">{formatElapsed(elapsed)}</div>
          </div>
          <div className="mt-0.5 text-xs text-muted-foreground">{phase.detail}</div>
        </div>
      </div>
    </div>
  );
}

/**
 * Tracks scan elapsed time in whole seconds. Returns 0 when `cached` is true
 * so we don't show a counter for instant cache replays.
 */
function useElapsedSeconds(cached: boolean): number {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    if (cached) return;
    const t0 = performance.now();
    const id = window.setInterval(() => {
      setSeconds(Math.floor((performance.now() - t0) / 1000));
    }, 250);
    return () => window.clearInterval(id);
  }, [cached]);
  return seconds;
}

function formatElapsed(s: number): string {
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
}

/**
 * Derives a human-readable phase label + detail line from which tool outputs
 * have arrived so far. The pipeline order is: recon (parallel) → identity →
 * pivot loop → analyst → narrator. We classify based on the last
 * `output-available` tool seen.
 */
function phaseFromParts(parts: AgentPart[]): { label: string; detail: string } {
  if (parts.length === 0) {
    return {
      label: "Starting scan",
      detail: "Validating input and spinning up agents.",
    };
  }

  const done = new Set(parts.filter((p) => p.state === "output-available").map((p) => p.toolName));
  const inFlight = parts.filter((p) => p.state === "input-available");

  const reconTools = [
    "breach_lookup",
    "github_lookup",
    "gravatar_lookup",
    "paste_search",
    "user_scanner_lookup",
  ];
  const reconDone = reconTools.filter((t) => done.has(t)).length;
  const reconTotal = reconTools.length;

  if (done.has("correlate_risk")) {
    return {
      label: "Drafting executive summary",
      detail: "Risk score finalized; the narrator is writing your report.",
    };
  }

  // If a pivot-stage tool is currently in-flight, we're in the pivot loop.
  const pivotInFlight = inFlight.some(
    (p) => p.toolName === "username_enum" || p.toolName === "github_profile_lookup",
  );
  const pivotDone = done.has("username_enum") || done.has("github_profile_lookup");
  if (pivotInFlight || (reconDone === reconTotal && !done.has("correlate_risk"))) {
    return {
      label: pivotDone ? "Expanding the identity graph" : "Pivoting on discovered handles",
      detail: "Probing public platforms for each candidate username — this is the slowest phase.",
    };
  }

  if (reconDone < reconTotal) {
    return {
      label: `Running recon (${reconDone}/${reconTotal})`,
      detail:
        "Querying breach, GitHub, Gravatar, paste-site, and account-registration sources in parallel.",
    };
  }

  return {
    label: "Correlating findings",
    detail: "Aggregating signals into the deterministic risk score.",
  };
}
