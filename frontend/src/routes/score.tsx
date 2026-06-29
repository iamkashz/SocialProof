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

type RuleRow = {
  signal: string;
  points: string;
  why: string;
};

const RULES: RuleRow[] = [
  {
    signal: "Each known data breach exposing this email",
    points: "+6 (capped at +40)",
    why: "More breaches = more places your credentials may have leaked from. Capped so a heavily-breached email doesn't max the score on this signal alone.",
  },
  {
    signal: "Any breach exposed a password",
    points: "+20",
    why: "Plaintext or hashed-and-cracked passwords from breaches power credential-stuffing attacks. This is the highest-impact single signal.",
  },
  {
    signal: "More than 5 distinct data classes exposed",
    points: "+10",
    why: "Lots of small breaches each leaking one field combine into a fuller picture of you — name + DOB + phone + address gets dangerous together.",
  },
  {
    signal: "Each confirmed public account (username-keyed pivot probes)",
    points: "+2 per account (capped at +15)",
    why: "Public accounts are footholds. They give attackers your handle, posting history, and pivot targets. Capped because being on N+1 platforms isn't materially worse than being on N.",
  },
  {
    signal: "Real name exposed on any discovered profile",
    points: "+8",
    why: "A handle isn't useful for spear-phishing until it's tied to a person.",
  },
  {
    signal: "Location exposed on any discovered profile",
    points: "+7",
    why: "Helps attackers tailor pretexts and bypass location-based fraud signals.",
  },
  {
    signal: "Email appears in paste sites, leaks, or darknet (via IntelligenceX)",
    points: "+5, plus +1 per hit (capped at +15)",
    why: "Any appearance means the email is circulating outside the user's control. Capped to avoid noisy emails (mailing-list moderators, public contacts) inflating the score.",
  },
  {
    signal: "Each account registration discovered across ~100 public services (via user-scanner)",
    points: "+1 per registration (capped at +15)",
    why: "Each public service tied to this email is another phishing pretext and another blast-radius surface. Capped because registrations are weaker signal than active breach or paste exposure — being on 30 services is materially different from being credentialed in 30 services.",
  },
];

const SEVERITY_BANDS: Array<{
  range: string;
  label: string;
  className: string;
}> = [
  {
    range: "75–100",
    label: "Critical",
    className: "border-destructive/40 bg-destructive/10 text-destructive",
  },
  { range: "50–74", label: "High", className: "border-warning/40 bg-warning/10 text-warning" },
  { range: "25–49", label: "Moderate", className: "border-primary/40 bg-primary/10 text-primary" },
  { range: "0–24", label: "Low", className: "border-success/40 bg-success/10 text-success" },
];

function Score() {
  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto w-full max-w-6xl px-4 py-16">
        <h1 className="text-3xl font-semibold tracking-tight">How scoring works</h1>
        <p className="mt-3 text-muted-foreground">
          Your risk score is computed deterministically from the agents' raw findings. No language
          model is involved in scoring — the LLM only writes the executive summary at the end. That
          means the same email produces the same score on every run.
        </p>

        <h2 className="mt-10 text-xl font-semibold text-primary">Severity bands</h2>
        <p className="mt-3 text-sm text-muted-foreground">
          The final score (0-100) maps to one of four severity labels:
        </p>
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          {SEVERITY_BANDS.map((band) => (
            <div
              key={band.label}
              className={`flex items-center justify-between rounded-lg border px-4 py-3 text-sm ${band.className}`}
            >
              <span className="font-medium">{band.label}</span>
              <span className="font-mono text-xs">{band.range}</span>
            </div>
          ))}
        </div>

        <h2 className="mt-10 text-xl font-semibold text-primary">The formula</h2>
        <p className="mt-3 text-sm text-muted-foreground">
          Each rule below adds points to a running total. The total is capped at 100.
        </p>
        <div className="mt-4 overflow-hidden rounded-xl border border-border">
          <table className="w-full text-sm">
            <thead className="bg-surface/60 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-4 py-2 text-left">Signal</th>
                <th className="px-4 py-2 text-right">Points</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {RULES.map((rule) => (
                <tr key={rule.signal} className="align-top">
                  <td className="px-4 py-3">
                    <div className="font-medium">{rule.signal}</div>
                    <div className="mt-1 text-xs text-muted-foreground">{rule.why}</div>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right font-mono text-primary">
                    {rule.points}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <h2 className="mt-10 text-xl font-semibold text-primary">Worked example</h2>
        <p className="mt-3 text-sm text-foreground/90">
          An email that appears in 4 breaches, one of which exposed passwords, leaking 7 distinct
          data classes total, with 3 public accounts confirmed and a real name visible on a public
          GitHub profile, 6 paste-site hits, and registered on 12 public services discovered via
          user-scanner:
        </p>
        <ul className="mt-3 space-y-1 rounded-lg border border-border bg-card/60 p-4 font-mono text-xs">
          <li>+24 from 4 breaches (4 × 6)</li>
          <li>+20 password exposed in at least one breach</li>
          <li>+10 more than 5 data classes total (7)</li>
          <li>+6 from 3 public accounts (3 × 2)</li>
          <li>+8 real name on public profile</li>
          <li>+0 location not exposed</li>
          <li>+11 from paste hits (5 baseline + 6 hits)</li>
          <li>+12 from account registrations (12, capped at 15)</li>
          <li className="border-t border-border/60 pt-1 text-foreground">= 91 / 100 → Critical</li>
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
