import { SiteFooter, SiteHeader } from "@/components/SiteChrome";
import { Link, createFileRoute } from "@tanstack/react-router";
import { ArrowRight, Sparkles } from "lucide-react";

export const Route = createFileRoute("/about")({
  head: () => ({
    meta: [
      { title: "About — SocialProof" },
      {
        name: "description",
        content: "Methodology, data sources, and the ethics of OSINT self-checks.",
      },
    ],
  }),
  component: About,
});

function About() {
  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto w-full max-w-6xl px-4 py-16">
        {/* Capstone banner — pinned at the top of /about so the framing
            is the first thing every visitor sees. */}
        <div className="mb-10 flex items-center gap-3 rounded-xl border border-primary/40 bg-primary/10 px-5 py-4">
          <Sparkles className="h-5 w-5 shrink-0 text-primary" />
          <p className="text-sm font-medium leading-snug text-foreground sm:text-base">
            Submitted as Capstone Project for{" "}
            <a
              href="https://www.kaggle.com/competitions/5-day-ai-agents-intensive-vibecoding-course-with-google"
              target="_blank"
              rel="noreferrer"
              className="text-primary underline-offset-4 hover:underline"
            >
              5-Day AI Agents: Intensive Vibe Coding Course With Google
            </a>{" "}
            <span className="text-muted-foreground">(June 15–19, 2026)</span>
          </p>
        </div>

        {/* 1. About SocialProof */}
        <h1 className="text-3xl font-semibold tracking-tight">About SocialProof</h1>
        <p className="mt-3 text-muted-foreground">
          SocialProof is a multi-agent OSINT tool that shows people what attackers can already see
          about them from publicly accessible data. The goal is awareness and remediation, not
          surveillance.
        </p>

        {/* 2. What we query */}
        <h2 className="mt-10 text-xl font-semibold text-primary">What we query</h2>
        <ul className="mt-3 list-disc space-y-1.5 pl-6 text-sm text-foreground/90">
          <li>
            <span className="font-mono">api.xposedornot.com</span> — known data breaches
          </li>
          <li>
            <span className="font-mono">api.github.com</span> — public commit search and user
            profile
          </li>
          <li>
            <span className="font-mono">gravatar.com</span> — public Gravatar profile
          </li>
          <li>
            <span className="font-mono">free.intelx.io</span> — paste sites, public leaks, darknet
            (metadata only — we never download leak contents)
          </li>
          <li>
            Public profile URLs on GitHub, Docker Hub, PyPI, Twitch, Keybase, HackerNews, Dev.to
          </li>
          <li>
            <span className="font-mono">user-scanner</span> (community OSINT library) — probes 100+
            public services for account-existence side channels; we skip the adult, news, jobs,
            sports, and CRM categories
          </li>
        </ul>

        {/* 3. Methodology — short pitch, full diagram on its own page */}
        <h2 className="mt-10 text-xl font-semibold text-primary">Methodology</h2>
        <p className="mt-3 text-sm text-foreground/90">
          Six specialized agents handle an email end-to-end — recon, identity resolution, a pivot
          loop that discovers new handles, deterministic risk scoring, and a narrator that phrases
          the verdict. Most stages are pure Python; only the parts that need language understanding
          call Gemini.
        </p>
        <div className="mt-5">
          <Link
            to="/methodology"
            className="inline-flex items-center gap-2 rounded-md border border-primary/40 bg-primary/10 px-4 py-2 text-sm font-medium text-primary transition hover:bg-primary/15"
          >
            See the full flowchart
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>

        {/* 4. What we don't do */}
        <h2 className="mt-10 text-xl font-semibold text-primary">What we don't do</h2>
        <ul className="mt-3 list-disc space-y-1.5 pl-6 text-sm text-foreground/90">
          <li>We don't store your email or your scan results server-side.</li>
          <li>We don't bypass any platform's authentication or rate limits.</li>
          <li>We don't share data with third parties.</li>
          <li>
            We only use IntelligenceX's metadata endpoints — actual leak contents are never
            downloaded.
          </li>
          <li>No analytics, no ads, no telemetry pixels.</li>
        </ul>

        {/* 5. Coming soon */}
        <h2 className="mt-10 text-xl font-semibold text-primary">Coming soon</h2>
        <p className="mt-3 text-sm text-muted-foreground">
          Future integrations planned for deeper coverage. Several require paid APIs or a longer
          build than the current capstone scope.
        </p>
        <ul className="mt-3 list-disc space-y-1.5 pl-6 text-sm text-foreground/90">
          <li>
            <span className="font-medium">HIBP Pro</span> — HaveIBeenPwned canonical breach API
            (paid subscription).
          </li>
          <li>
            <span className="font-medium">EmailRep.io</span> — email reputation signals (disposable,
            suspicious, profile activity).
          </li>
          <li>
            <span className="font-medium">Custom domain reputation</span> — for self-hosted or
            business email domains: WHOIS / RDAP age, MX records, SPF/DMARC posture, disposable-
            domain detection. Skipped for big consumer domains (gmail, outlook) where it adds no
            signal.
          </li>
          <li>
            <span className="font-medium">Image lookup</span> — perceptual-hash reverse search on
            the Gravatar avatar.
          </li>
          <li>
            <span className="font-medium">More platforms</span> — Bluesky, Mastodon, Steam, Patreon,
            Stack Overflow username matching.
          </li>
          <li>
            <span className="font-medium">Per-finding confidence levels</span> — high / medium / low
            confidence flags on each agent result (e.g. HackerNews handle matches get low confidence
            due to handle collision rates, breach hits get high confidence).
          </li>
          <li>
            <span className="font-medium">Scheduled rescans &amp; email alerts</span> — opt in to
            have SocialProof rescan saved emails on a schedule and notify you when the risk profile
            changes (new breach, new paste-site appearance, new public account discovered).
          </li>
        </ul>

        {/* 6. Use responsibly — kept last as a final note */}
        <h2 className="mt-10 text-xl font-semibold text-primary">Use responsibly</h2>
        <p className="mt-3 text-sm text-foreground/90">
          Only scan email addresses you own or are authorized to investigate. Even though the
          underlying sources are public, scanning others without consent may violate laws in your
          jurisdiction and is against the spirit of this tool.
        </p>
      </main>
      <SiteFooter />
    </div>
  );
}
