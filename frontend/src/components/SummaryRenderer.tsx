import React from "react";

/**
 * Render the narrator's executive-summary markdown.
 *
 * The narrator output is tightly constrained (see backend/app/agents/narrator.py):
 *   - 3-5 short paragraphs separated by blank lines
 *   - Each paragraph begins with a bolded section label like `**Risk:**`
 *   - Bold spans within the text use `**...**`
 *
 * On top of plain bold, we colourise severity tokens (Critical / High /
 * Moderate / Low) to match the colour family used by `RiskGauge` so the
 * verdict is visually consistent across the page.
 *
 * Colour mapping (mirrors RiskGauge):
 *   Critical → text-destructive
 *   High     → text-warning
 *   Moderate → text-primary
 *   Low      → text-success
 */
export function SummaryRenderer({ markdown }: { markdown: string }) {
  const paragraphs = markdown
    .trim()
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);
  return (
    <div className="space-y-3 text-sm leading-relaxed text-foreground/90">
      {paragraphs.map((para, i) => (
        <p key={i}>{renderInline(para)}</p>
      ))}
    </div>
  );
}

const BOLD_RE = /\*\*([^*]+)\*\*/g;
const SEVERITY_RE = /\b(Critical|High|Moderate|Low)\b/g;

// Pill rather than raw coloured text — a lone red word in a paragraph reads
// as a typo. The pill becomes a deliberate badge that doesn't fight the
// surrounding prose.
function severityClass(word: string): string {
  const base =
    "inline-flex items-center rounded-md border px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider align-baseline";
  switch (word) {
    case "Critical":
      return `${base} border-destructive/40 bg-destructive/10 text-destructive`;
    case "High":
      return `${base} border-warning/40 bg-warning/10 text-warning`;
    case "Moderate":
      return `${base} border-primary/40 bg-primary/10 text-primary`;
    case "Low":
      return `${base} border-success/40 bg-success/10 text-success`;
    default:
      return "";
  }
}

// Replace any bare severity tokens in a string slice with coloured spans.
function colourSeverities(text: string, keyOffset: number): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  let last = 0;
  let key = 0;
  let m: RegExpExecArray | null;
  // Reset lastIndex because regexes with /g hold state.
  SEVERITY_RE.lastIndex = 0;
  while ((m = SEVERITY_RE.exec(text)) !== null) {
    if (m.index > last) out.push(text.slice(last, m.index));
    out.push(
      <span key={`sev-${keyOffset}-${key++}`} className={severityClass(m[1])}>
        {m[1]}
      </span>,
    );
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

function renderInline(text: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let key = 0;
  BOLD_RE.lastIndex = 0;
  while ((match = BOLD_RE.exec(text)) !== null) {
    if (match.index > lastIndex) {
      // Plain (non-bold) span — colour severity words inside it.
      nodes.push(...colourSeverities(text.slice(lastIndex, match.index), key++));
    }
    // Bold span — preserve bold treatment; severity words inside the bold
    // span (e.g. "**Risk:**" doesn't contain them, but defensive) get the
    // bold styling overridden by the severity colour.
    const inner = match[1];
    if (SEVERITY_RE.test(inner)) {
      SEVERITY_RE.lastIndex = 0;
      nodes.push(
        <strong key={`b-${key++}`} className="font-semibold text-foreground">
          {colourSeverities(inner, key++)}
        </strong>,
      );
    } else {
      nodes.push(
        <strong key={`b-${key++}`} className="font-semibold text-foreground">
          {inner}
        </strong>,
      );
    }
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) {
    nodes.push(...colourSeverities(text.slice(lastIndex), key++));
  }
  return nodes;
}
