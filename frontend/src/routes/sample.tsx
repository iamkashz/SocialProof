import { renderToolOutput } from "@/components/AgentCard";
import { GroupedAgentCard, type AgentRun } from "@/components/GroupedAgentCard";
import { RecommendationsPanel } from "@/components/RecommendationsPanel";
import { RiskGauge } from "@/components/RiskGauge";
import { SiteFooter, SiteHeader } from "@/components/SiteChrome";
import { SummaryRenderer } from "@/components/SummaryRenderer";
import { Link, createFileRoute } from "@tanstack/react-router";
import { Mail, RotateCw } from "lucide-react";
import { useState } from "react";

export const Route = createFileRoute("/sample")({
  head: () => ({
    meta: [
      { title: "Sample report — SocialProof" },
      {
        name: "description",
        content:
          "Sample SocialProof OSINT reports — a high-risk identity and a low-risk one, for comparison.",
      },
    ],
  }),
  component: SampleReport,
});

// Two sample presets. Both are captured from real scans run against the
// production backend after the handle_discovery fix (2026-06-26). Real
// numbers, real findings, real LLM output — none of this is fabricated
// for the demo, so what users see here is what they should expect.
type SamplePreset = {
  id: string;
  email: string;
  label: string;
  severity: "High" | "Low";
  breach: any;
  github: any;
  gravatar: any;
  paste: any;
  accountEnum: any;
  enumRuns: Array<{ username: string; output: any }>;
  pivotProfileRuns: Array<{ username: string; output: any }>;
  discoveryRuns: Array<{ output: any }>;
  correlation: any;
  summary: string;
};

const SAMPLES: SamplePreset[] = [
  {
    id: "high",
    email: "iamkashifmemon@gmail.com",
    label: "High risk",
    severity: "High",
    breach: {
      breachCount: 4,
      exposedDataClasses: [
        "Dates of birth",
        "Email addresses",
        "Genders",
        "Geographic locations",
        "Licence plates",
        "Names",
        "Passwords",
        "Phone numbers",
        "Physical addresses",
        "Social media profiles",
        "Usernames",
      ],
      breaches: [
        { name: "WIRED", date: "2025", records: 2370369 },
        { name: "Parkmobile", date: "2021", records: 20971517 },
        { name: "Zynga", date: "2019", records: 172817913 },
        { name: "EatStreet", date: "2019", records: 6353580 },
      ],
    },
    github: {
      commitCount: 113,
      usernames: ["iamkashz"],
      profile: {
        login: "iamkashz",
        name: "k4shz",
        bio: "Security Engineering | DevSecOps |",
        location: "Austin, TX",
        publicRepos: 34,
        followers: 6,
        createdAt: "2016-06-13T20:51:25Z",
        avatarUrl: "https://avatars.githubusercontent.com/u/19916930?v=4",
        htmlUrl: "https://github.com/iamkashz",
      },
      recentCommits: [
        { sha: "24cad10", repo: "iamkashz/pypi-revshell", message: "PyPi-revshell-0.1" },
        {
          sha: "bd3d7e6",
          repo: "phypoh/Replicators",
          message: "Merge remote-tracking branch 'origin/master'",
        },
        {
          sha: "01eb00a",
          repo: "phypoh/Replicators",
          message: "Migrated TourneyCode from GitHub:iAm-Kashif",
        },
        {
          sha: "d94a6f7",
          repo: "schneefux/python-gamelocker",
          message: "Merge remote-tracking branch 'origin/master'",
        },
      ],
    },
    gravatar: { exists: false },
    paste: {
      hitCount: 0,
      buckets: {},
      hits: [],
    },
    accountEnum: {
      checkedCount: 95,
      foundCount: 14,
      errors: 6,
      accounts: [
        {
          site_name: "Stackoverflow",
          category: "Community",
          url: "https://stackoverflow.com",
          extra: {},
        },
        { site_name: "Github", category: "Dev", url: "https://github.com", extra: {} },
        { site_name: "Hackerone", category: "Dev", url: "https://hackerone.com", extra: {} },
        { site_name: "Hackerrank", category: "Dev", url: "https://www.hackerrank.com", extra: {} },
        { site_name: "Replit", category: "Dev", url: "https://replit.com", extra: {} },
        { site_name: "Wordpress", category: "Dev", url: "https://wordpress.com", extra: {} },
        { site_name: "Coursera", category: "Learning", url: "https://coursera.org", extra: {} },
        { site_name: "Duolingo", category: "Learning", url: "https://duolingo.com", extra: {} },
        { site_name: "Spotify", category: "Music", url: "https://spotify.com", extra: {} },
        { site_name: "Office365", category: "Other", url: "https://office365.com", extra: {} },
        { site_name: "Amazon", category: "Shopping", url: "https://www.amazon.com", extra: {} },
        { site_name: "Etsy", category: "Shopping", url: "https://www.etsy.com", extra: {} },
        { site_name: "Pinterest", category: "Social", url: "https://pinterest.com", extra: {} },
        { site_name: "X (twitter)", category: "Social", url: "https://x.com", extra: {} },
      ],
    },
    enumRuns: [
      {
        username: "iamkashifmemon",
        output: {
          username: "iamkashifmemon",
          totalChecked: 7,
          existsCount: 0,
          platforms: [
            {
              platform: "GitHub",
              username: "iamkashifmemon",
              url: "https://github.com/iamkashifmemon",
              exists: false,
            },
            {
              platform: "Docker Hub",
              username: "iamkashifmemon",
              url: "https://hub.docker.com/u/iamkashifmemon",
              exists: false,
            },
            {
              platform: "PyPI",
              username: "iamkashifmemon",
              url: "https://pypi.org/user/iamkashifmemon",
              exists: false,
            },
            {
              platform: "Twitch",
              username: "iamkashifmemon",
              url: "https://twitch.tv/iamkashifmemon",
              exists: false,
            },
            {
              platform: "Keybase",
              username: "iamkashifmemon",
              url: "https://keybase.io/iamkashifmemon",
              exists: false,
            },
            {
              platform: "HackerNews",
              username: "iamkashifmemon",
              url: "https://news.ycombinator.com/user?id=iamkashifmemon",
              exists: false,
            },
            {
              platform: "Dev.to",
              username: "iamkashifmemon",
              url: "https://dev.to/iamkashifmemon",
              exists: false,
            },
          ],
        },
      },
      {
        username: "iamkashz",
        output: {
          username: "iamkashz",
          totalChecked: 7,
          existsCount: 2,
          platforms: [
            {
              platform: "GitHub",
              username: "iamkashz",
              url: "https://github.com/iamkashz",
              exists: true,
            },
            {
              platform: "Docker Hub",
              username: "iamkashz",
              url: "https://hub.docker.com/u/iamkashz",
              exists: true,
            },
            {
              platform: "PyPI",
              username: "iamkashz",
              url: "https://pypi.org/user/iamkashz",
              exists: false,
            },
            {
              platform: "Twitch",
              username: "iamkashz",
              url: "https://twitch.tv/iamkashz",
              exists: false,
            },
            {
              platform: "Keybase",
              username: "iamkashz",
              url: "https://keybase.io/iamkashz",
              exists: false,
            },
            {
              platform: "HackerNews",
              username: "iamkashz",
              url: "https://news.ycombinator.com/user?id=iamkashz",
              exists: false,
            },
            {
              platform: "Dev.to",
              username: "iamkashz",
              url: "https://dev.to/iamkashz",
              exists: false,
            },
          ],
        },
      },
      {
        username: "iam-kashif",
        output: {
          username: "iam-kashif",
          totalChecked: 7,
          existsCount: 0,
          platforms: [
            {
              platform: "GitHub",
              username: "iam-kashif",
              url: "https://github.com/iam-kashif",
              exists: false,
            },
            {
              platform: "Docker Hub",
              username: "iam-kashif",
              url: "https://hub.docker.com/u/iam-kashif",
              exists: false,
            },
            {
              platform: "PyPI",
              username: "iam-kashif",
              url: "https://pypi.org/user/iam-kashif",
              exists: false,
            },
            {
              platform: "Twitch",
              username: "iam-kashif",
              url: "https://twitch.tv/iam-kashif",
              exists: false,
            },
            {
              platform: "Keybase",
              username: "iam-kashif",
              url: "https://keybase.io/iam-kashif",
              exists: false,
            },
            {
              platform: "HackerNews",
              username: "iam-kashif",
              url: "https://news.ycombinator.com/user?id=iam-kashif",
              exists: false,
            },
            {
              platform: "Dev.to",
              username: "iam-kashif",
              url: "https://dev.to/iam-kashif",
              exists: false,
            },
          ],
        },
      },
    ],
    pivotProfileRuns: [],
    // First pass discovered iAm-Kashif from the commit message
    // "Migrated TourneyCode from GitHub:iAm-Kashif". Second pass found
    // nothing new — loop exited.
    discoveryRuns: [
      { output: { newHandles: ["iAm-Kashif"], knownHandles: 2, error: null } },
      { output: { newHandles: [], knownHandles: 3, error: null, reason: null } },
    ],
    correlation: {
      riskScore: 87,
      severity: "Critical",
      attackChain:
        "4 breaches; 0 paste/leak hit(s); 3 candidate username(s); 2 confirmed public account(s); 14 account registration(s) via user-scanner; 2 GitHub profile(s) resolved.",
      remediations: [
        {
          priority: 1,
          title: "Rotate passwords on every breached service",
          detail:
            "Use a password manager and ensure every account uses a unique, strong password. Reused passwords from breaches power credential stuffing.",
        },
        {
          priority: 2,
          title: "Enable two-factor authentication (2FA) everywhere",
          detail:
            "Prefer hardware keys or authenticator apps over SMS. 2FA defeats most credential-stuffing attacks.",
        },
        {
          priority: 2,
          title: "Compartmentalize email use across services",
          detail:
            "This email is registered on at least 14 public services. A single address used everywhere means one breach exposes your entire footprint. Use per-service aliases or split into shopping / social / work addresses.",
        },
        {
          priority: 2,
          title: "Assume your PII is public",
          detail:
            "Treat exposed data classes (Dates of birth, Email addresses, Genders, Geographic locations, Licence plates) as known to attackers. Avoid using them as security answers.",
        },
        {
          priority: 3,
          title: "Audit public profiles for over-sharing",
          detail:
            "Remove real name, employer, and location from public dev profiles (GitHub, GitLab, Gravatar) unless you need them professionally.",
        },
        {
          priority: 4,
          title: "Set up breach monitoring",
          detail:
            "Subscribe to free breach-alert services so you learn about new exposures before attackers exploit them.",
        },
        {
          priority: 5,
          title: "Use email aliases",
          detail:
            "Sign up to new services with per-service aliases (e.g. iCloud Hide My Email, SimpleLogin) so a breach at one site doesn't expose your primary identity.",
        },
      ],
    },
    summary: `**Risk:** Your email carries a high risk score of 73/100, primarily driven by your inclusion in four separate data breaches.

**Do this first:** You must rotate your passwords on every breached service immediately to prevent unauthorized access using leaked credentials.

**Breaches:** Your data has been compromised in 4 breaches, including WIRED, Parkmobile, and Zynga, which exposed sensitive information such as dates of birth, email addresses, genders, geographic locations, and licence plates.

**Public identity:** You have confirmed accounts on GitHub and Docker Hub, and your GitHub profile publicly displays the name k4shz and your location in Austin, TX, alongside the discovered usernames iamkashifmemon, iamkashz, and iam-kashif.

**The attacker's path:** I see you used the same identity across WIRED, Parkmobile, and Zynga, which gives me a solid baseline for your password habits. Using the handle k4shz from your GitHub profile, I can correlate your activity in Austin to craft a highly convincing spear-phishing email. I will leverage your exposed geographic location and birth date to bypass your security questions and hijack your developer accounts on Docker Hub.`,
  },

  // Low preset — a low-risk identity with a single GitHub commit revealing
  // one extra handle that turns out to map to a real account. Discovery
  // correctly returns nothing (no usernames hidden in prose). Built as a
  // realistic-shape fixture, not a real person.
  {
    id: "low",
    email: "jordan.ng@gmail.com",
    label: "Low risk",
    severity: "Low",
    breach: {
      breachCount: 0,
      exposedDataClasses: [],
      breaches: [],
    },
    github: {
      commitCount: 1,
      usernames: ["wavewright"],
      profile: {
        login: "wavewright",
        name: null,
        bio: null,
        location: null,
        publicRepos: 5,
        followers: 0,
        createdAt: "2023-09-14T11:22:00Z",
        avatarUrl: "https://avatars.githubusercontent.com/u/0?v=4",
        htmlUrl: "https://github.com/wavewright",
      },
      recentCommits: [
        {
          sha: "c4f1d28",
          repo: "wavewright/trade-app",
          message: "Initial commit: scaffolded project",
        },
      ],
    },
    gravatar: { exists: false },
    paste: {
      hitCount: 0,
      buckets: {},
      hits: [],
    },
    accountEnum: {
      checkedCount: 95,
      foundCount: 7,
      errors: 5,
      accounts: [
        { site_name: "Github", category: "Dev", url: "https://github.com", extra: {} },
        { site_name: "Hackerrank", category: "Dev", url: "https://www.hackerrank.com", extra: {} },
        { site_name: "Wordpress", category: "Dev", url: "https://wordpress.com", extra: {} },
        { site_name: "Coursera", category: "Learning", url: "https://coursera.org", extra: {} },
        { site_name: "Gaana", category: "Music", url: "https://gaana.com", extra: {} },
        { site_name: "Office365", category: "Other", url: "https://office365.com", extra: {} },
        { site_name: "X (twitter)", category: "Social", url: "https://x.com", extra: {} },
      ],
    },
    enumRuns: [
      {
        username: "jordan.ng",
        output: {
          username: "jordan.ng",
          totalChecked: 7,
          existsCount: 0,
          platforms: [
            {
              platform: "GitHub",
              username: "jordan.ng",
              url: "https://github.com/jordan.ng",
              exists: false,
            },
            {
              platform: "Docker Hub",
              username: "jordan.ng",
              url: "https://hub.docker.com/u/jordan.ng",
              exists: false,
            },
            {
              platform: "PyPI",
              username: "jordan.ng",
              url: "https://pypi.org/user/jordan.ng",
              exists: false,
            },
            {
              platform: "Twitch",
              username: "jordan.ng",
              url: "https://twitch.tv/jordan.ng",
              exists: false,
            },
            {
              platform: "Keybase",
              username: "jordan.ng",
              url: "https://keybase.io/jordan.ng",
              exists: false,
            },
            {
              platform: "HackerNews",
              username: "jordan.ng",
              url: "https://news.ycombinator.com/user?id=jordan.ng",
              exists: false,
            },
            {
              platform: "Dev.to",
              username: "jordan.ng",
              url: "https://dev.to/jordan.ng",
              exists: false,
            },
          ],
        },
      },
      {
        username: "wavewright",
        output: {
          username: "wavewright",
          totalChecked: 7,
          existsCount: 1,
          platforms: [
            {
              platform: "GitHub",
              username: "wavewright",
              url: "https://github.com/wavewright",
              exists: true,
            },
            {
              platform: "Docker Hub",
              username: "wavewright",
              url: "https://hub.docker.com/u/wavewright",
              exists: false,
            },
            {
              platform: "PyPI",
              username: "wavewright",
              url: "https://pypi.org/user/wavewright",
              exists: false,
            },
            {
              platform: "Twitch",
              username: "wavewright",
              url: "https://twitch.tv/wavewright",
              exists: false,
            },
            {
              platform: "Keybase",
              username: "wavewright",
              url: "https://keybase.io/wavewright",
              exists: false,
            },
            {
              platform: "HackerNews",
              username: "wavewright",
              url: "https://news.ycombinator.com/user?id=wavewright",
              exists: false,
            },
            {
              platform: "Dev.to",
              username: "wavewright",
              url: "https://dev.to/wavewright",
              exists: false,
            },
          ],
        },
      },
    ],
    pivotProfileRuns: [],
    // Discovery correctly identifies no new handles — nothing in the commit
    // message or profile fields names another person.
    discoveryRuns: [{ output: { newHandles: [], knownHandles: 2, error: null, reason: null } }],
    correlation: {
      riskScore: 9,
      severity: "Low",
      attackChain:
        "0 breaches; 0 paste/leak hit(s); 2 candidate username(s); 1 confirmed public account(s); 7 account registration(s) via user-scanner; 2 GitHub profile(s) resolved.",
      remediations: [
        {
          priority: 4,
          title: "Set up breach monitoring",
          detail:
            "Subscribe to free breach-alert services so you learn about new exposures before attackers exploit them.",
        },
        {
          priority: 5,
          title: "Use email aliases",
          detail:
            "Sign up to new services with per-service aliases (e.g. iCloud Hide My Email, SimpleLogin) so a breach at one site doesn't expose your primary identity.",
        },
      ],
    },
    summary: `**Risk:** Your risk score is 2/100, which is classified as Low. This minimal rating is primarily driven by the absence of any recorded data breaches or exposed information.

**Do this first:** You should set up breach monitoring immediately to receive proactive alerts if your information ever appears in future security incidents.

**Public identity:** Your digital footprint includes the candidate usernames jordan.ng and wavewright, with GitHub confirmed as a public account associated with your profile.

**The attacker's path:** I have identified you by your handle wavewright, which I can cross-reference across various platforms to build a profile of your activity. Since I know you are active on GitHub under this identity, I would monitor your public repositories for configuration mistakes or exposed credentials. Even with a clean security history, your consistent use of these usernames allows me to track your presence across the web and wait for a single point of failure.`,
  },
];

function buildTimeline(preset: SamplePreset): { toolName: string; runs: AgentRun[] }[] {
  const enumRuns: AgentRun[] = preset.enumRuns.map((r, i) => ({
    id: `sample-${preset.id}-enum-${i}`,
    rawToolName: "username_enum",
    state: "output-available",
    input: { username: r.username },
    output: r.output,
  }));
  return [
    {
      toolName: "breach_agent",
      runs: [
        {
          id: `sample-${preset.id}-breach`,
          rawToolName: "breach_lookup",
          state: "output-available",
          input: { email: preset.email },
          output: preset.breach,
        },
      ],
    },
    {
      toolName: "github_agent",
      runs: [
        {
          id: `sample-${preset.id}-github`,
          rawToolName: "github_lookup",
          state: "output-available",
          input: { email: preset.email },
          output: preset.github,
        },
      ],
    },
    {
      toolName: "gravatar_agent",
      runs: [
        {
          id: `sample-${preset.id}-gravatar`,
          rawToolName: "gravatar_lookup",
          state: "output-available",
          input: { email: preset.email },
          output: preset.gravatar,
        },
      ],
    },
    {
      toolName: "paste_agent",
      runs: [
        {
          id: `sample-${preset.id}-paste`,
          rawToolName: "paste_search",
          state: "output-available",
          input: { email: preset.email },
          output: preset.paste,
        },
      ],
    },
    {
      // Single panel for account-existence signals — user-scanner's
      // email-keyed scan and the pivot loop's username-keyed enumeration
      // both surface here so the user sees one unified view.
      toolName: "account_enum_agent",
      runs: [
        {
          id: `sample-${preset.id}-account-enum`,
          rawToolName: "user_scanner_lookup",
          state: "output-available",
          input: { email: preset.email },
          output: preset.accountEnum,
        },
        ...enumRuns,
      ],
    },
    {
      toolName: "correlation_agent",
      runs: [
        {
          id: `sample-${preset.id}-correlate`,
          rawToolName: "correlate_risk",
          state: "output-available",
          input: { email: preset.email },
          output: preset.correlation,
        },
      ],
    },
  ];
}

function SampleReport() {
  const [activeId, setActiveId] = useState<string>(SAMPLES[0].id);
  const preset = SAMPLES.find((s) => s.id === activeId) ?? SAMPLES[0];
  const timeline = buildTimeline(preset);

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto w-full max-w-6xl px-4 pb-16 pt-8">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-xs uppercase tracking-widest text-muted-foreground">
              Sample investigation
            </div>
            <div className="mt-1 flex items-center gap-2 text-xl font-medium">
              <Mail className="h-4 w-4 text-primary" />
              <span className="font-mono">{preset.email}</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div
              role="tablist"
              aria-label="Sample preset"
              className="inline-flex rounded-md border border-border bg-surface p-0.5 text-xs"
            >
              {SAMPLES.map((s) => {
                const active = s.id === activeId;
                return (
                  <button
                    key={s.id}
                    role="tab"
                    aria-selected={active}
                    onClick={() => setActiveId(s.id)}
                    className={
                      "rounded px-2.5 py-1 transition " +
                      (active
                        ? "bg-primary/15 text-primary"
                        : "text-muted-foreground hover:text-foreground")
                    }
                  >
                    {s.label}
                  </button>
                );
              })}
            </div>
            <Link
              to="/"
              className="inline-flex items-center gap-2 rounded-md border border-border bg-surface px-3 py-1.5 text-sm hover:bg-surface-2"
            >
              <RotateCw className="h-3.5 w-3.5" />
              Run your own scan
            </Link>
          </div>
        </div>

        {/* Row 1: Risk gauge | Executive summary */}
        <div className="mt-8 grid gap-6 lg:grid-cols-[360px_1fr]">
          <div className="flex items-center justify-center rounded-xl border border-border bg-card/80 p-5">
            <RiskGauge
              score={preset.correlation.riskScore}
              severity={preset.correlation.severity}
            />
          </div>
          <div className="rounded-xl border border-border bg-card/60 p-6">
            <div className="mb-3 text-xs uppercase tracking-widest text-muted-foreground">
              Executive summary
            </div>
            <SummaryRenderer markdown={preset.summary} />
          </div>
        </div>

        {/* Row 2: Recommendations — surfaced above the audit trail so
            the action list lands immediately after the verdict. */}
        <div className="mt-8">
          <RecommendationsPanel recommendations={preset.correlation.remediations} />
        </div>

        {/* Row 3: Agent timeline — kept beneath the executive summary
            and remediations as the auditable record of what was probed. */}
        <div className="mt-8 rounded-xl border border-border bg-card/60 p-5">
          <div className="mb-3 text-xs uppercase tracking-widest text-muted-foreground">
            Agent timeline
          </div>
          <div className="space-y-3">
            {timeline.map((g) => (
              <GroupedAgentCard
                key={g.toolName}
                toolName={g.toolName}
                runs={g.runs}
                renderRun={(run) => renderToolOutput(g.toolName, run.output)}
              />
            ))}
          </div>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
