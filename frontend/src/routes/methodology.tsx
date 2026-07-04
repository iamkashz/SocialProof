import { MethodologyDiagram } from "@/components/MethodologyDiagram";
import { SiteFooter, SiteHeader } from "@/components/SiteChrome";
import { Link, createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/methodology")({
  head: () => ({
    meta: [
      { title: "Methodology — SocialProof" },
      {
        name: "description",
        content:
          "How SocialProof orchestrates six specialized agents to investigate an email, score risk, and produce a report.",
      },
    ],
  }),
  component: Methodology,
});

function Methodology() {
  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto w-full max-w-6xl px-4 py-8">
        <h1 className="text-3xl font-semibold tracking-tight">How SocialProof works</h1>
        <p className="mt-3 text-muted-foreground">
          A single email address travels through six specialized agents. Most are deterministic
          Python — only the parts that need language understanding (handle discovery from prose,
          executive summary) call Gemini. The diagram below auto-plays once to show the flow.
        </p>

        <div className="mt-8">
          <MethodologyDiagram />
        </div>

        <h2 className="mt-12 text-xl font-semibold text-primary">What each stage does</h2>
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <StageCard
            label="Input Validator"
            sub="Deterministic"
            body="Allowlist-validated email parsing. Rejects shell metacharacters, control chars, Unicode homoglyphs, oversized inputs, and prompt-injection-flavored strings before the agent graph ever runs."
          />
          <StageCard
            label="Recon (5 agents, parallel)"
            sub="Deterministic"
            body="Breach Lookup (XposedOrNot), GitHub Mining (commit-author search + profile), Account Enum (user-scanner email-side, ~95 services), Gravatar Profile, and Paste & Leak Search (IntelligenceX metadata). Five HTTP fan-outs running concurrently."
          />
          <StageCard
            label="Identity Resolver"
            sub="Deterministic"
            body="Aggregates every username surfaced by recon — GitHub logins, Twitter handles in profiles, Gravatar preferred names, blog-URL fragments — into a single deduplicated candidate list."
          />
          <StageCard
            label="Pivot Loop"
            sub="Deterministic + LLM"
            body="Two deterministic agents (Account Enumeration across ~95 platforms via user-scanner, Profile Pivot to fetch newly-found GitHub profiles) plus Handle Discovery — a Gemini call that reads prose fields (breach descriptions, commit messages, bios) for usernames the regex-based aggregator missed. Loops until no new handles surface, capped at 2 iterations."
          />
          <StageCard
            label="Risk Analyst"
            sub="Deterministic"
            body="Pure Python scoring: breaches × 6 (capped at 40), +20 for password exposure, +per-account points, +real-name / location bonuses, paste hits with dedup against breach data. Same email → same score, every time. See /score for the full formula."
          />
          <StageCard
            label="Report Narrator"
            sub="LLM (Gemini) + output guardrail"
            body="Reads the finalized findings and writes a 5-section markdown summary with severity pills and an attacker-perspective walkthrough. Every section is validated before it reaches the user — hallucinated handles or names are dropped section-by-section, so a single confabulated line can't poison the whole report. Cannot affect the score either way; text generation runs on settled data."
          />
        </div>

        <h2 className="mt-12 text-xl font-semibold text-primary">Why mostly deterministic?</h2>
        <p className="mt-3 max-w-3xl text-sm text-muted-foreground">
          The LLM does what only an LLM can do — language understanding and summary writing.
          Everything else is code. Three reasons that matters:
        </p>
        <div className="mt-4 grid gap-4 lg:grid-cols-3">
          <ReasonCard
            label="Reproducibility"
            body="The same email produces the same score across runs. Reports are defensible to read; the system is testable."
          />
          <ReasonCard
            label="Auditability"
            body={
              <>
                The scoring rules are public on the{" "}
                <Link to="/score" className="text-primary hover:underline">
                  scoring page
                </Link>
                . No LLM black box sits between findings and the final number.
              </>
            }
          />
          <ReasonCard
            label="Cost & reliability"
            body="One LLM call per scan (the narrator) plus optional handle-discovery inside the pivot loop — instead of a dozen calls fighting rate limits."
          />
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}

function StageCard({ label, sub, body }: { label: string; sub: string; body: string }) {
  return (
    <div className="rounded-xl border border-border bg-card/60 p-5">
      <div className="flex items-center justify-between gap-2">
        <div className="font-medium">{label}</div>
        <span className="rounded-md border border-border/60 bg-surface/60 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          {sub}
        </span>
      </div>
      <p className="mt-2 text-sm text-muted-foreground">{body}</p>
    </div>
  );
}

function ReasonCard({ label, body }: { label: string; body: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-card/60 p-5">
      <div className="text-xs uppercase tracking-widest text-primary">{label}</div>
      <p className="mt-2 text-sm text-foreground/90">{body}</p>
    </div>
  );
}
