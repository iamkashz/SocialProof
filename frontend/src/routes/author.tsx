import { SiteFooter, SiteHeader } from "@/components/SiteChrome";
import { createFileRoute } from "@tanstack/react-router";
import { Globe, Linkedin, Loader2, Mail } from "lucide-react";

// Discord doesn't ship in lucide-react. We use the official mark from
// /public/img/discord.png and wrap it as a component matching lucide's
// { className } prop signature so LinkTile can swap it in like any other
// icon. object-contain keeps the rounded mark intact inside the square
// 16px slot LinkTile gives icons.
function DiscordIcon({ className }: { className?: string }) {
  return (
    <img
      src="/img/discord.png"
      alt=""
      aria-hidden="true"
      className={`object-contain ${className ?? ""}`}
    />
  );
}

export const Route = createFileRoute("/author")({
  head: () => ({
    meta: [
      { title: "Author — SocialProof" },
      {
        name: "description",
        content: "Kashz — author of SocialProof.",
      },
    ],
  }),
  component: Author,
});

type Cert = { label: string; href?: string };

// Current focus. One entry at a time so the section stays a punchy
// "here's what I'm reading right now" line, not a roadmap.
const IN_PROGRESS: Cert[] = [
  {
    label: "SANS SEC545: GenAI & LLM Application Security",
    href: "https://www.sans.org/cyber-security-courses/genai-llm-application-security-5day",
  },
];

function Author() {
  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto w-full max-w-6xl px-4 py-12">
        {/* Hero — avatar + name + tagline */}
        <div className="grid items-center gap-6 lg:grid-cols-[180px_1fr]">
          <div className="flex flex-col items-center">
            <div className="h-36 w-36 overflow-hidden rounded-2xl border border-border bg-card/60 shadow-sm shadow-primary/10">
              <img
                src="/img/author.jpg"
                alt="Kashz"
                className="h-full w-full object-cover"
              />
            </div>
          </div>

          <div>
            <div className="font-mono text-xl text-primary">$ whoami</div>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight">Kashz</h1>
            <p className="mt-2 text-sm text-muted-foreground">Security Engineer</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Trained to break stuff, getting paid to secure it.
            </p>
          </div>
        </div>

        {/* Intro paragraph — voice, not resume */}
        <section className="mt-10">
          <p className="text-sm leading-relaxed text-foreground/90">
            My career has been across security — operations, offensive, cloud, and engineering.
            Currently I'm a Security Engineer at Amazon, helping builders ship secure software at
            scale. Outside of work, I do pentesting and write up what I learn at{" "}
            <a
              href="https://kashz.gitbook.io/kashz-jewels"
              target="_blank"
              rel="noreferrer"
              className="text-primary underline-offset-4 hover:underline"
            >
              /kashz-jewels
            </a>{" "}
            — and I'm always up for a good CTF or hackathon. I'm a constant self-learner with a soft
            spot for new technology, and this course was a good excuse to spend a week deep in
            agents instead of reading about them or watching tutorial videos in my YouTube feed.{" "}
            <span className="text-foreground">Want to chat? My email and Discord are below.</span>
          </p>
        </section>

        {/* Currently working on — in-progress / current focus */}
        <section className="mt-10">
          <h2 className="flex items-center gap-2 text-xl font-semibold text-primary">
            <Loader2 className="h-4 w-4" />
            Currently working on
          </h2>
          <ul className="mt-4 grid gap-2 sm:grid-cols-2">
            {IN_PROGRESS.map((c, i) => (
              <CertRow key={i} cert={c} />
            ))}
          </ul>
        </section>

        {/* Find me */}
        <section className="mt-10">
          <h2 className="text-xl font-semibold text-primary">Let's connect!</h2>
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            <LinkTile
              icon={Linkedin}
              label="LinkedIn"
              handle="/memonKashif"
              href="https://www.linkedin.com/in/memonkashif"
            />
            <LinkTile icon={DiscordIcon} label="Discord" handle="kashz" />
            <LinkTile
              icon={Mail}
              label="Email"
              handle="iamkashifmemon@gmail.com"
              href="mailto:iamkashifmemon@gmail.com"
            />
            <LinkTile
              icon={Globe}
              label="Gitbook"
              handle="/kashz-jewels"
              href="https://kashz.gitbook.io/kashz-jewels"
            />
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}

/** Compact row for a current-focus cert. */
function CertRow({ cert }: { cert: Cert }) {
  const inner = <span className="text-sm leading-tight">{cert.label}</span>;
  if (cert.href) {
    return (
      <li>
        <a
          href={cert.href}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-2.5 rounded-lg border border-border/60 bg-card/40 px-3 py-2 transition hover:border-primary/30 hover:bg-card/60"
        >
          {inner}
        </a>
      </li>
    );
  }
  return (
    <li>
      <div className="flex items-center gap-2.5 rounded-lg border border-border/60 bg-card/40 px-3 py-2">
        {inner}
      </div>
    </li>
  );
}

function LinkTile({
  icon: Icon,
  label,
  handle,
  href,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  handle: string;
  href?: string;
}) {
  const inner = (
    <>
      <div className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-primary/15 text-primary">
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0">
        <div className="text-xs uppercase tracking-widest text-muted-foreground">{label}</div>
        <div className="truncate font-mono text-sm">{handle}</div>
      </div>
    </>
  );
  if (href) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        className="flex items-center gap-3 rounded-lg border border-border bg-card/60 p-3 transition hover:border-primary/30 hover:bg-card/80"
      >
        {inner}
      </a>
    );
  }
  // No href (e.g. Discord) — render as a non-link tile so the handle is
  // visible but doesn't pretend to be clickable.
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-card/60 p-3">
      {inner}
    </div>
  );
}
