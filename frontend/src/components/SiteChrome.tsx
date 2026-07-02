import { cn } from "@/lib/utils";
import { Link } from "@tanstack/react-router";

/**
 * Inline SocialProof mark. Option I from design-explorations/logos —
 * a shell prompt chevron + lowercase `sp` in Inter. Inlined (not
 * imported as an external SVG asset) so it inherits currentColor and
 * sits inside the existing primary-tinted tile in the header.
 */
function SocialProofMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" role="img" aria-label="SocialProof" className={className}>
      {/* Shell-style chevron prompt */}
      <path
        d="M 13 26 L 19 32 L 13 38"
        fill="none"
        stroke="currentColor"
        strokeWidth="5"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeOpacity="0.75"
      />
      {/* sp — Inter 800. Renders with the font already loaded by the site. */}
      <text
        x="24"
        y="42"
        textAnchor="start"
        fontFamily="Inter, ui-sans-serif, system-ui, sans-serif"
        fontWeight={800}
        fontSize={26}
        letterSpacing={-0.5}
        fill="currentColor"
      >
        sp
      </text>
    </svg>
  );
}

export function SiteHeader({ className }: { className?: string }) {
  return (
    <header
      className={cn(
        "sticky top-0 z-30 border-b border-border/60 bg-background/70 backdrop-blur",
        className,
      )}
    >
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between px-4">
        <Link to="/" className="flex items-center gap-2 font-semibold tracking-tight">
          <span className="grid h-7 w-7 place-items-center rounded-md bg-primary/15 text-primary">
            <SocialProofMark className="h-5 w-5" />
          </span>
          <span>SocialProof</span>
          <span className="ml-1 rounded bg-surface-2 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
            OSINT
          </span>
        </Link>
        <nav className="flex items-center gap-1 text-sm">
          {/* Order follows visitor curiosity: demo first, then deeper
              explanations in increasing depth, then trust signals. */}
          <Link
            to="/sample"
            className="rounded-md px-3 py-1.5 text-muted-foreground hover:bg-surface hover:text-foreground"
          >
            Sample
          </Link>
          <Link
            to="/score"
            className="rounded-md px-3 py-1.5 text-muted-foreground hover:bg-surface hover:text-foreground"
          >
            Scoring
          </Link>
          <Link
            to="/methodology"
            className="rounded-md px-3 py-1.5 text-muted-foreground hover:bg-surface hover:text-foreground"
          >
            Methodology
          </Link>
          <Link
            to="/about"
            className="rounded-md px-3 py-1.5 text-muted-foreground hover:bg-surface hover:text-foreground"
          >
            About
          </Link>
        </nav>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="mt-24 border-t border-border/60 py-8 text-sm text-muted-foreground">
      <div className="mx-auto flex w-full max-w-6xl flex-col items-start justify-between gap-2 px-4 sm:flex-row sm:items-center">
        <div>
          © {new Date().getFullYear()} SocialProof · Know what attackers know |{" "}
          <Link to="/author" className="hover:text-foreground hover:underline">
            Built by Kashz
          </Link>
        </div>
        <div className="font-mono text-xs">Only scan emails you own or are authorized to scan.</div>
      </div>
    </footer>
  );
}
