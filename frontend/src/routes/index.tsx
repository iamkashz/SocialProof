import { ScanInput } from "@/components/ScanInput";
import { SiteFooter, SiteHeader } from "@/components/SiteChrome";
import { Link, createFileRoute } from "@tanstack/react-router";
import {
  AlertTriangle,
  BellRing,
  Briefcase,
  Building2,
  Clock,
  Eye,
  FileWarning,
  Gauge,
  Github,
  Globe,
  Image as ImageIcon,
  Lock,
  Network,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  UserCircle,
} from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "SocialProof — See what attackers know about you" },
      {
        name: "description",
        content:
          "Paste your email and a multi-agent OSINT system shows you exactly what attackers can discover online, then tells you how to fix it.",
      },
      { property: "og:title", content: "SocialProof — See what attackers know about you" },
      {
        property: "og:description",
        content:
          "A multi-agent OSINT scanner that audits your digital footprint and gives you a prioritized remediation plan.",
      },
    ],
  }),
  component: Landing,
});

function Landing() {
  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main>
        <section className="relative overflow-hidden border-b border-border/60">
          <div className="absolute inset-0 grid-bg opacity-40" />
          <div className="relative mx-auto w-full max-w-4xl px-4 pb-20 pt-24 text-center">
            <div className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-surface/60 px-3 py-1 text-xs text-muted-foreground">
              <Sparkles className="h-3 w-3 text-primary" />
              Multi-agent OSINT, free to try
            </div>
            <h1 className="mt-6 text-balance text-4xl font-semibold tracking-tight sm:text-6xl">
              See your digital footprint the way{" "}
              <span className="bg-gradient-to-r from-primary via-primary to-warning bg-clip-text text-transparent">
                attackers do
              </span>
              .
            </h1>
            <p className="mx-auto mt-5 max-w-2xl text-pretty text-base text-muted-foreground sm:text-lg">
              Paste an email address. Watch six specialized agents pivot through breaches, GitHub,
              public profiles, paste-site leaks, and account registrations across 100+ services —
              then get a scored risk report and tailored recommendations.
            </p>

            <div className="mx-auto mt-8 max-w-xl">
              <ScanInput autoFocus />
              <div className="mt-3 text-xs text-muted-foreground">
                Or{" "}
                <Link to="/sample" className="text-primary underline-offset-4 hover:underline">
                  view a sample report
                </Link>{" "}
                to see what you'll get.
              </div>
            </div>
          </div>
        </section>

        {/* 1. 3-step user flow (How it works) — comes right after the
            hero so visitors see what they'll actually do before reading
            agent technical detail. */}
        <section className="border-y border-border/60 bg-surface/40">
          <div className="mx-auto grid w-full max-w-6xl gap-8 px-4 py-16 md:grid-cols-3">
            <Step
              n={1}
              title="Paste an email"
              body="No login. We only use the address to query public sources."
            />
            <Step
              n={2}
              title="Watch the agents work"
              body="Each step streams its findings — you see what attackers see, live."
            />
            <Step
              n={3}
              title="Get a fix list"
              body="Prioritized recommendations, severity-rated. Download the report as JSON."
            />
          </div>
        </section>

        {/* 2. The agents themselves — depth after the flow overview. */}
        <section className="mx-auto w-full max-w-6xl px-4 py-20">
          <div className="mb-10 text-center">
            <h2 className="text-2xl font-semibold sm:text-3xl">
              Six specialized agents, one report
            </h2>
            <p className="mt-2 text-muted-foreground">
              Each agent queries a different source and reports its findings in real time.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <AgentTile
              icon={ShieldAlert}
              name="Breach Agent"
              desc="Pulls every known data breach exposing this email — including which fields leaked."
            />
            <AgentTile
              icon={Github}
              name="GitHub Agent"
              desc="Mines public commits for usernames, real names, locations, and account age."
            />
            <AgentTile
              icon={UserCircle}
              name="Gravatar Agent"
              desc="Looks up Gravatar profile data — display name, bio, linked social accounts."
            />
            <AgentTile
              icon={Network}
              name="Account Enum Agent"
              desc="Probes 100+ services for account registrations (email-keyed via user-scanner; username-keyed across GitHub, Docker Hub, PyPI, Twitch, Keybase, HackerNews, Dev.to)."
            />
            <AgentTile
              icon={FileWarning}
              name="Paste Leaks Agent"
              desc="Searches paste sites, public leaks, and darknet via IntelligenceX — surfaces credential dumps and accidental exposures."
            />
            <AgentTile
              icon={Gauge}
              name="Correlation Agent"
              desc="Stitches findings into an attack chain, computes a risk score, and prioritizes fixes."
            />
          </div>
          <div className="mt-8 text-center text-sm">
            <Link to="/methodology" className="text-primary underline-offset-4 hover:underline">
              See how they connect →
            </Link>
          </div>
        </section>

        {/* 3. Privacy / trust — between product depth and future scope. */}
        <section className="border-y border-border/60 bg-surface/40">
          <div className="mx-auto w-full max-w-6xl px-4 py-20">
            <div className="mb-8 text-center">
              <h2 className="text-2xl font-semibold sm:text-3xl">Privacy by design</h2>
              <p className="mt-2 text-muted-foreground">
                SocialProof is the OSINT scanner you'd want pointed at yourself, not against you.
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <PrivacyTile
                icon={Lock}
                name="No accounts, no storage"
                desc="No login required. Your email and results stay in your browser session — never persisted to a user account or shared service."
              />
              <PrivacyTile
                icon={Eye}
                name="No third-party tracking"
                desc="No analytics, no ad pixels, no telemetry sent off-host. The only outbound calls are the OSINT APIs the agents query."
              />
              <PrivacyTile
                icon={ShieldCheck}
                name="Public sources only"
                desc="We query the same public APIs anyone can hit, and only use IntelligenceX's metadata — never leak contents. Full source list on the about page."
              />
            </div>
            <div className="mt-6 text-center text-xs text-muted-foreground">
              See{" "}
              <Link to="/about" className="text-primary underline-offset-4 hover:underline">
                what we query and what we don't do
              </Link>{" "}
              for the full breakdown.
            </div>
          </div>
        </section>

        {/* 4. Future scope — visitors who've made it this far care about
            the roadmap. */}
        <section className="mx-auto w-full max-w-6xl px-4 py-20">
          <div className="mb-8 text-center">
            <div className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-surface/60 px-3 py-1 text-xs text-muted-foreground">
              <Clock className="h-3 w-3 text-primary" />
              Future scope
            </div>
            <h2 className="mt-4 text-2xl font-semibold sm:text-3xl">Coming soon</h2>
            <p className="mt-2 text-muted-foreground">
              Planned integrations for deeper coverage. Most require paid APIs or a longer build.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <FutureTile
              icon={ShieldCheck}
              name="HIBP Pro"
              desc="HaveIBeenPwned API for canonical breach data. Requires a paid subscription."
            />
            <FutureTile
              icon={Briefcase}
              name="EmailRep"
              desc="EmailRep.io reputation signals — disposable, suspicious, profile activity."
            />
            <FutureTile
              icon={ImageIcon}
              name="Image Lookup"
              desc="Reverse-search the Gravatar avatar for matching profiles and known-bad accounts."
            />
            <FutureTile
              icon={Globe}
              name="Custom Domain Reputation"
              desc="For self-hosted / business email domains: WHOIS age, MX records, SPF/DMARC, disposable-domain detection. Skipped for big consumer domains (gmail, outlook, etc.) where it tells you nothing."
            />
            <FutureTile
              icon={Building2}
              name="Stack & Forum Probes"
              desc="Bluesky, Mastodon, Steam, Patreon, Stack Overflow username matching."
            />
            <FutureTile
              icon={BellRing}
              name="Scheduled Rescans & Alerts"
              desc="Rescan saved emails on a schedule and email you when the risk profile changes — new breach, new paste-site appearance, or a new public account discovered."
            />
          </div>
        </section>

        {/* 5. Use responsibly — final disclaimer. */}
        <section className="mx-auto w-full max-w-3xl px-4 pb-20">
          <div className="rounded-2xl border border-warning/40 bg-warning/5 p-6">
            <div className="flex items-center gap-2 text-warning">
              <AlertTriangle className="h-4 w-4" />
              <h3 className="text-sm font-semibold uppercase tracking-widest">Use responsibly</h3>
            </div>
            <p className="mt-2 text-sm text-foreground/90">
              Only scan email addresses you own or are authorized to investigate. SocialProof uses
              the same public data sources defenders and attackers already have — but that doesn't
              make scanning third parties without consent ethical or legal in your jurisdiction.
            </p>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}

function AgentTile({
  icon: Icon,
  name,
  desc,
}: {
  icon: React.ComponentType<{ className?: string }>;
  name: string;
  desc: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card/60 p-5 transition hover:border-primary/40 hover:bg-card/80">
      <div className="flex items-center justify-between">
        <div className="grid h-9 w-9 place-items-center rounded-md bg-primary/15 text-primary">
          <Icon className="h-4 w-4" />
        </div>
        <span className="inline-flex items-center gap-1 rounded-full border border-success/30 bg-success/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-success">
          <span className="inline-block h-1 w-1 rounded-full bg-success" />
          Live
        </span>
      </div>
      <div className="mt-4 font-medium">{name}</div>
      <p className="mt-1 text-sm text-muted-foreground">{desc}</p>
    </div>
  );
}

function FutureTile({
  icon: Icon,
  name,
  desc,
}: {
  icon: React.ComponentType<{ className?: string }>;
  name: string;
  desc: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card/60 p-5 transition hover:border-primary/30 hover:bg-card/80">
      <div className="flex items-center justify-between">
        <div className="grid h-9 w-9 place-items-center rounded-md bg-primary/10 text-primary/70">
          <Icon className="h-4 w-4" />
        </div>
        <span className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-primary">
          <span className="inline-block h-1 w-1 animate-pulse rounded-full bg-primary" />
          Soon
        </span>
      </div>
      <div className="mt-4 font-medium">{name}</div>
      <p className="mt-1 text-sm text-muted-foreground">{desc}</p>
    </div>
  );
}

function PrivacyTile({
  icon: Icon,
  name,
  desc,
}: {
  icon: React.ComponentType<{ className?: string }>;
  name: string;
  desc: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card/60 p-5">
      <div className="grid h-9 w-9 place-items-center rounded-md bg-success/10 text-success">
        <Icon className="h-4 w-4" />
      </div>
      <div className="mt-4 font-medium">{name}</div>
      <p className="mt-1 text-sm text-muted-foreground">{desc}</p>
    </div>
  );
}

function Step({ n, title, body }: { n: number; title: string; body: string }) {
  return (
    <div>
      <div className="font-mono text-xs text-primary">0{n}</div>
      <div className="mt-1 text-lg font-medium">{title}</div>
      <p className="mt-1 text-sm text-muted-foreground">{body}</p>
    </div>
  );
}
