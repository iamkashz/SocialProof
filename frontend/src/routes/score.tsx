import { SiteFooter, SiteHeader } from "@/components/SiteChrome";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/score")({
  head: () => ({
    meta: [
      { title: "How scoring works — SocialProof" },
      {
        name: "description",
        content:
          "The exact formula SocialProof uses to compute your risk score — fully deterministic, no LLM involvement.",
      },
    ],
  }),
  component: Score,
});

type SignalRow = {
  signal: string;
  points: string;
  why: string;
};

type CategoryBlock = {
  name: string;
  cap: string;
  intent: string;
  signals: SignalRow[];
};

// Mirrors backend/app/osint/correlate.py exactly. Any change there must be
// reflected here — drift breaks trust with the user.
const CATEGORIES: CategoryBlock[] = [
  {
    name: "Credential Exposure",
    cap: "0–25",
    intent:
      "How directly attackable the email's credentials are. Driven by breach data — the foundational signal that something has actually been exfiltrated.",
    signals: [
      {
        signal: "Each known data breach exposing this email",
        points: "log₂(1 + n) × 6, capped at +15",
        why: "Diminishing returns: breach #1 is catastrophic, breach #8 barely worse than #5.",
      },
      {
        signal: "Any breach exposed a password",
        points: "+7",
        why: "Binary and devastating — leaked passwords power credential-stuffing immediately.",
      },
      {
        signal: "Number of distinct exposed data classes",
        points: "log₂(1 + n) × 2.5, capped at +8",
        why: "Breadth of leaked data types — name + DOB + phone + address gets dangerous together.",
      },
    ],
  },
  {
    name: "Leak Presence",
    cap: "0–25",
    intent:
      "Whether the email is actively circulating in paste sites, leak archives, and darknet corpora.",
    signals: [
      {
        signal: "Visible paste-site / leak / darknet hits",
        points: "log₂(1 + n) × 5, capped at +18",
        why: "Verified circulation in attacker communities. Strong evidence.",
      },
      {
        signal: "Additional hits in leak corpora (counts only)",
        points: "log₂(1 + n) × 2, capped at +10",
        why: "Count-only evidence; weighted lower than verified hits since we can't read the records.",
      },
    ],
  },
  {
    name: "Identity Correlation",
    cap: "0–25",
    intent:
      "How easily a discovered handle ties to a real person — the difference between an anonymous account and a phishable target.",
    signals: [
      {
        signal: "Real name discovered on a public profile",
        points: "+5",
        why: "Enables social engineering and cross-platform identity pivots.",
      },
      {
        signal: "Location discovered on a public profile",
        points: "+4",
        why: "Geographic targeting and data-broker enrichment.",
      },
      {
        signal: "Name AND location both exposed",
        points: "+4 bonus (on top of the individual signals)",
        why: "Superlinear combination: together they unlock targeted pretexting and address enrichment that neither enables alone.",
      },
      {
        signal: "Linked usernames discovered",
        points: "log₂(1 + n) × 4, capped at +12",
        why: "Each linked handle is a pivot point for discovering more accounts, repos, posts.",
      },
    ],
  },
  {
    name: "Attack Surface",
    cap: "0–25",
    intent:
      "Breadth of public accounts and service registrations tied to this email — every account is a potential phishing target.",
    signals: [
      {
        signal: "Primary account count (larger of: confirmed public accounts or service registrations)",
        points: "log₂(1 + n) × 4, capped at +18",
        why: "Attack-surface breadth. First few accounts matter most; diminishing returns past ~10.",
      },
      {
        signal: "Secondary account count (smaller of the two)",
        points: "log₂(1 + n) × 1, capped at +7",
        why: "Independent-detection corroboration without double-counting. Two methods agreeing on a service is real evidence, but not 2× evidence.",
      },
    ],
  },
];

const SEVERITY_BANDS: Array<{
  range: string;
  label: string;
  meaning: string;
  className: string;
}> = [
  {
    range: "70–100",
    label: "Critical",
    meaning: "Credential leakage AND broad identity exposure — actively targetable across multiple vectors.",
    className: "border-destructive/40 bg-destructive/10 text-destructive",
  },
  {
    range: "45–69",
    label: "High",
    meaning: "Credential leakage OR significant identity correlation with attack surface.",
    className: "border-warning/40 bg-warning/10 text-warning",
  },
  {
    range: "20–44",
    label: "Moderate",
    meaning: "Real public footprint, but no credential leakage — phishing pretext material exists, no direct exploitation path.",
    className: "border-primary/40 bg-primary/10 text-primary",
  },
  {
    range: "0–19",
    label: "Low",
    meaning: "Minimal discoverable exposure. Attacker gains almost nothing from public sources.",
    className: "border-success/40 bg-success/10 text-success",
  },
];

function Score() {
  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto w-full max-w-6xl px-4 py-16">
        <h1 className="text-3xl font-semibold tracking-tight">How scoring works</h1>
        <p className="mt-3 text-muted-foreground">
          Your risk score is computed deterministically from the agents' raw findings. No language
          model is involved in scoring — the LLM only writes the executive summary at the end. The
          same email produces the same score on every run.
        </p>

        <h2 className="mt-10 text-xl font-semibold text-primary">The category structure</h2>
        <p className="mt-3 text-sm text-foreground/90">
          The score is the sum of four sub-scores, each independently capped at 25 points. Reaching
          Critical (70+) therefore requires real exposure across more than one dimension —
          maxing a single category alone can only earn 25 points. Each category uses logarithmic
          diminishing returns on count-based signals: the first few instances of any signal weigh
          heavily, additional counts yield diminishing marginal points.
        </p>

        <div className="mt-6 space-y-6">
          {CATEGORIES.map((cat) => (
            <div key={cat.name} className="overflow-hidden rounded-xl border border-border">
              <div className="flex items-center justify-between gap-3 border-b border-border bg-surface/60 px-4 py-3">
                <div>
                  <div className="font-semibold">{cat.name}</div>
                  <div className="mt-0.5 text-xs text-muted-foreground">{cat.intent}</div>
                </div>
                <span className="rounded-md border border-primary/40 bg-primary/10 px-2 py-0.5 font-mono text-xs text-primary">
                  {cat.cap}
                </span>
              </div>
              <table className="w-full text-sm">
                <tbody className="divide-y divide-border/60">
                  {cat.signals.map((row) => (
                    <tr key={row.signal} className="align-top">
                      <td className="px-4 py-3">
                        <div className="font-medium">{row.signal}</div>
                        <div className="mt-1 text-xs text-muted-foreground">{row.why}</div>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right font-mono text-primary">
                        {row.points}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>

        <h2 className="mt-10 text-xl font-semibold text-primary">Floor rule</h2>
        <p className="mt-3 text-sm text-foreground/90">
          If any breach exposed a password, the final score is forced to a minimum of 25 (Moderate).
          A leaked password is immediately actionable for credential stuffing regardless of how
          private the rest of your public footprint is — under-scoring that would be wrong.
        </p>

        <h2 className="mt-10 text-xl font-semibold text-primary">Severity bands</h2>
        <p className="mt-3 text-sm text-muted-foreground">
          The final score (0-100) maps to one of four severity labels:
        </p>
        <div className="mt-4 space-y-2">
          {SEVERITY_BANDS.map((band) => (
            <div
              key={band.label}
              className={`flex flex-col gap-1 rounded-lg border px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between sm:gap-4 ${band.className}`}
            >
              <div className="flex items-baseline gap-3">
                <span className="font-semibold">{band.label}</span>
                <span className="font-mono text-xs opacity-80">{band.range}</span>
              </div>
              <span className="text-xs opacity-90">{band.meaning}</span>
            </div>
          ))}
        </div>

        <h2 className="mt-10 text-xl font-semibold text-primary">Worked example</h2>
        <p className="mt-3 text-sm text-foreground/90">
          An email in 6 breaches with passwords exposed and 7 distinct data classes, found in 5
          visible paste-site hits and 26 additional leak corpus records, with a real name and
          location visible on a public GitHub profile, 3 linked usernames, 24 confirmed public
          accounts, and 30 services registered via user-scanner:
        </p>
        <ul className="mt-3 space-y-1 rounded-lg border border-border bg-card/60 p-4 font-mono text-xs">
          <li>
            Credential Exposure: 6·log₂(7) + 7 + 2.5·log₂(8) = 16.8 + 7 + 7.5 = 31.3 → capped at <b>25</b>
          </li>
          <li>
            Leak Presence: 5·log₂(6) + 2·log₂(27) = 12.9 + 9.5 = <b>22.4</b>
          </li>
          <li>
            Identity Correlation: 5 + 4 + 4 (name+location bonus) + 4·log₂(4) = <b>21.0</b>
          </li>
          <li>
            Attack Surface: 4·log₂(31) + 1·log₂(25) = min(18, 19.8) + min(7, 4.6) = 18 + 4.6 = <b>22.6</b>
          </li>
          <li className="border-t border-border/60 pt-1 text-foreground">
            Total: 25 + 22.4 + 21.0 + 22.6 = <b>91 / 100 → Critical</b>
          </li>
        </ul>

        <h2 className="mt-10 text-xl font-semibold text-primary">Why it's deterministic</h2>
        <p className="mt-3 text-sm text-foreground/90">
          Language models are good at writing prose, not at calibrated scoring. They drift between
          runs, anchor on irrelevant context, and can be coaxed into wildly different answers by
          rewording the prompt. By making the score a pure Python function over structured findings,
          we get three properties an LLM can't give us: every run is reproducible, the rules are
          auditable (you can read them above), and we can write evaluation tests that catch
          regressions when we tune the weights.
        </p>

        <h2 className="mt-10 text-xl font-semibold text-primary">What this score is not</h2>
        <ul className="mt-3 list-disc space-y-1.5 pl-6 text-sm text-foreground/90">
          <li>
            It is not a measure of how likely you are to be attacked. It's a measure of how much
            public exposure exists for an attacker to start with.
          </li>
          <li>
            It does not account for what you've already done about each finding (rotated passwords,
            enabled 2FA, etc.) — SocialProof can't see that.
          </li>
          <li>
            It is not comparable across users in a meaningful way. Two people with the same score
            may face very different real-world risk depending on their threat model.
          </li>
        </ul>
      </main>
      <SiteFooter />
    </div>
  );
}
