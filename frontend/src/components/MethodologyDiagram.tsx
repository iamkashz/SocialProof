import { useEffect, useRef, useState } from "react";

/**
 * Vertical animated flowchart of the SocialProof orchestration.
 *
 *          [Email Address]
 *                │
 *          [Input Validator]
 *                │
 *   ┌────┬────┬──┼──┬────┬────┐
 *  Breach GitHub Account-Enum Gravatar Paste   ← recon · parallel
 *   └────┴────┴──┼──┴────┴────┘
 *          [Identity Resolver]
 *                │
 *   ┌────────────┬────────────┐
 * Account     Profile     Handle      ← pivot loop · max 2
 *  Enum       Pivot       Discovery (LLM)
 *   └────────────┴────────────┘
 *                │
 *          [Risk Analyst]
 *                │
 *          [Report Narrator (Gemini)]
 *                │
 *          [Live Report]
 *
 * Animation: auto-plays once when scrolled into view. No replay controls
 * (kept clean — the diagram is documentation, not a toy).
 *
 * Why JS state machine over CSS keyframes: 9 sequenced groups with
 * different members and dependent arrows would need a dozen keyframes
 * with hand-tuned delays. A small step counter is more readable.
 */

const STEP_MS = 380;

// Each step lights up the listed node ids.
const SEQUENCE: string[][] = [
  ["email"],
  ["seed"],
  ["breach", "github", "gravatar", "paste", "account_enum"],
  ["identity"],
  ["enum", "pivot", "discovery"],
  ["loop"], // synthetic — lights up the self-loop annotation
  ["analyst"],
  ["narrator"],
  ["report"],
];

const TOTAL_STEPS = SEQUENCE.length;

// Slightly tighter canvas — boxes themselves are smaller so the whole
// flow is more glanceable. Page-hosted on /methodology where it can
// breathe; on /about it's just a teaser link.
const W = 820;
const H = 970;

// Column anchors
// Recon row now has 5 nodes (added Account Enum). Even spacing centered
// on the canvas: ±300, ±150, 0. SMALL.w is 132, so the gutter between
// adjacent boxes is 150 - 132 = 18px, which matches the prior layout's
// breathing room.
const cx = {
  center: W / 2,
  recon0: W / 2 - 300,
  recon1: W / 2 - 150,
  recon2: W / 2,
  recon3: W / 2 + 150,
  recon4: W / 2 + 300,
  pivot0: W / 2 - 205,
  pivot1: W / 2,
  pivot2: W / 2 + 205,
};

// Row anchors (y-centers)
const cy = {
  email: 50,
  seed: 145,
  recon: 255,
  identity: 380,
  pivot: 505,
  loopLabel: 622,
  analyst: 700,
  narrator: 805,
  report: 930,
};

const BOX = { w: 140, h: 46 };
const SMALL = { w: 132, h: 44 };

type NodeKind = "io" | "deterministic" | "llm";

type NodeDef = {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  kind: NodeKind;
  label: string;
  sub?: string;
};

const NODES: NodeDef[] = [
  {
    id: "email",
    x: cx.center,
    y: cy.email,
    w: BOX.w,
    h: BOX.h,
    kind: "io",
    label: "Email Address",
    sub: "user@example.com",
  },
  {
    id: "seed",
    x: cx.center,
    y: cy.seed,
    w: BOX.w,
    h: BOX.h,
    kind: "deterministic",
    label: "Input Validator",
    sub: "harden + normalize",
  },
  {
    id: "breach",
    x: cx.recon0,
    y: cy.recon,
    w: SMALL.w,
    h: SMALL.h,
    kind: "deterministic",
    label: "Breach Lookup",
    sub: "XposedOrNot",
  },
  {
    id: "github",
    x: cx.recon1,
    y: cy.recon,
    w: SMALL.w,
    h: SMALL.h,
    kind: "deterministic",
    label: "GitHub Mining",
    sub: "api.github.com",
  },
  {
    id: "account_enum",
    x: cx.recon2,
    y: cy.recon,
    w: SMALL.w,
    h: SMALL.h,
    kind: "deterministic",
    label: "Account Enum",
    sub: "user-scanner",
  },
  {
    id: "gravatar",
    x: cx.recon3,
    y: cy.recon,
    w: SMALL.w,
    h: SMALL.h,
    kind: "deterministic",
    label: "Gravatar Profile",
    sub: "gravatar.com",
  },
  {
    id: "paste",
    x: cx.recon4,
    y: cy.recon,
    w: SMALL.w,
    h: SMALL.h,
    kind: "deterministic",
    label: "Paste & Leak Search",
    sub: "IntelligenceX",
  },
  {
    id: "identity",
    x: cx.center,
    y: cy.identity,
    w: BOX.w,
    h: BOX.h,
    kind: "deterministic",
    label: "Identity Resolver",
    sub: "aggregate handles",
  },
  {
    id: "enum",
    x: cx.pivot0,
    y: cy.pivot,
    w: SMALL.w,
    h: SMALL.h,
    kind: "deterministic",
    label: "Account Enumeration",
    sub: "user-scanner",
  },
  {
    id: "pivot",
    x: cx.pivot1,
    y: cy.pivot,
    w: SMALL.w,
    h: SMALL.h,
    kind: "deterministic",
    label: "Profile Pivot",
    sub: "GitHub profile",
  },
  {
    id: "discovery",
    x: cx.pivot2,
    y: cy.pivot,
    w: SMALL.w,
    h: SMALL.h,
    kind: "llm",
    label: "Handle Discovery",
    sub: "Gemini",
  },
  {
    id: "analyst",
    x: cx.center,
    y: cy.analyst,
    w: BOX.w,
    h: BOX.h,
    kind: "deterministic",
    label: "Risk Analyst",
    sub: "deterministic scoring",
  },
  {
    id: "narrator",
    x: cx.center,
    y: cy.narrator,
    w: BOX.w,
    h: BOX.h,
    kind: "llm",
    label: "Report Narrator",
    sub: "Gemini · summary",
  },
  {
    id: "report",
    x: cx.center,
    y: cy.report,
    w: BOX.w,
    h: BOX.h,
    kind: "io",
    label: "Live Report",
    sub: "SSE → React UI",
  },
];

const NODE_INDEX: Record<string, NodeDef> = Object.fromEntries(NODES.map((n) => [n.id, n]));

// Edges: [fromId, toId]. The step on which an edge activates is determined
// by when its `to` node first appears in SEQUENCE.
const EDGES: Array<[string, string]> = [
  ["email", "seed"],
  ["seed", "breach"],
  ["seed", "github"],
  ["seed", "gravatar"],
  ["seed", "paste"],
  ["seed", "account_enum"],
  ["breach", "identity"],
  ["github", "identity"],
  ["gravatar", "identity"],
  ["paste", "identity"],
  ["account_enum", "identity"],
  ["identity", "enum"],
  ["identity", "pivot"],
  ["identity", "discovery"],
  ["enum", "analyst"],
  ["pivot", "analyst"],
  ["discovery", "analyst"],
  ["analyst", "narrator"],
  ["narrator", "report"],
];

function stepForNode(id: string): number {
  for (let i = 0; i < SEQUENCE.length; i++) {
    if (SEQUENCE[i].includes(id)) return i;
  }
  return Infinity;
}

export function MethodologyDiagram() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [step, setStep] = useState(0);
  const timersRef = useRef<number[]>([]);
  const hasPlayedRef = useRef(false);

  function clearTimers() {
    timersRef.current.forEach((t) => clearTimeout(t));
    timersRef.current = [];
  }

  function play() {
    clearTimers();
    setStep(0);
    for (let i = 1; i <= TOTAL_STEPS; i++) {
      const t = window.setTimeout(() => setStep(i), i * STEP_MS);
      timersRef.current.push(t);
    }
  }

  // Auto-play once when the diagram scrolls into view.
  useEffect(() => {
    if (!containerRef.current) return;
    const el = containerRef.current;
    const obs = new IntersectionObserver(
      (entries) => {
        const e = entries[0];
        if (e.isIntersecting && !hasPlayedRef.current) {
          hasPlayedRef.current = true;
          play();
        }
      },
      { threshold: 0.25 },
    );
    obs.observe(el);
    return () => {
      obs.disconnect();
      clearTimers();
    };
  }, []);

  // Bracket geometry — wrap the recon / pivot rows.
  const reconBracket = {
    x: cx.recon0 - SMALL.w / 2 - 18,
    y: cy.recon - SMALL.h / 2 - 32,
    w: cx.recon4 + SMALL.w / 2 + 18 - (cx.recon0 - SMALL.w / 2 - 18),
    h: SMALL.h + 50,
  };
  const pivotBracket = {
    x: cx.pivot0 - SMALL.w / 2 - 18,
    y: cy.pivot - SMALL.h / 2 - 32,
    w: cx.pivot2 + SMALL.w / 2 + 18 - (cx.pivot0 - SMALL.w / 2 - 18),
    h: SMALL.h + 60,
  };

  return (
    <div ref={containerRef} className="rounded-xl border border-border bg-card/40 p-8">
      {/* Legend lives at the top — readers see the colour key before
          they encounter the coloured boxes below. */}
      <div className="mb-6 flex flex-wrap items-center gap-4 border-b border-border/60 pb-5 text-xs">
        <LegendChip dotClass="bg-card border-primary">Deterministic agent</LegendChip>
        <LegendChip dotClass="bg-warning/10 border-warning">LLM call</LegendChip>
        <LegendChip dotClass="bg-surface border-muted-foreground">I/O</LegendChip>
        <span className="ml-2 text-muted-foreground">Dashed groups = orchestration phases.</span>
      </div>
      <div className="overflow-x-auto">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="mx-auto h-auto w-full"
          role="img"
          aria-label="SocialProof agent orchestration flowchart"
        >
          <defs>
            <marker
              id="md-arrowhead"
              viewBox="0 0 10 10"
              refX="9"
              refY="5"
              markerWidth="7"
              markerHeight="7"
              orient="auto-start-reverse"
            >
              <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--color-muted-foreground)" />
            </marker>
            <marker
              id="md-arrowhead-active"
              viewBox="0 0 10 10"
              refX="9"
              refY="5"
              markerWidth="7"
              markerHeight="7"
              orient="auto-start-reverse"
            >
              <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--color-primary)" />
            </marker>
          </defs>

          {/* Phase group brackets — drawn first so they sit behind nodes. */}
          <PhaseGroup
            label="recon · parallel"
            x={reconBracket.x}
            y={reconBracket.y}
            w={reconBracket.w}
            h={reconBracket.h}
            active={step >= stepForNode("breach") + 1}
          />
          <PhaseGroup
            label="pivot loop · max 2 iter"
            x={pivotBracket.x}
            y={pivotBracket.y}
            w={pivotBracket.w}
            h={pivotBracket.h}
            highlight
            active={step >= stepForNode("enum") + 1}
          />

          {/* Edges */}
          {EDGES.map(([from, to]) => {
            const a = NODE_INDEX[from];
            const b = NODE_INDEX[to];
            const active = step >= stepForNode(to) + 1;
            return <Edge key={`${from}->${to}`} fromNode={a} toNode={b} active={active} />;
          })}

          {/* Self-loop on the pivot bracket */}
          <LoopArc
            active={step >= stepForNode("loop") + 1}
            x={cx.center}
            yTop={pivotBracket.y + pivotBracket.h + 4}
            xLeft={pivotBracket.x - 18}
            xRight={pivotBracket.x + pivotBracket.w + 18}
          />
          <text
            x={cx.center}
            y={cy.loopLabel + 30}
            textAnchor="middle"
            fontSize={12}
            fill={
              step >= stepForNode("loop") + 1
                ? "var(--color-primary)"
                : "var(--color-muted-foreground)"
            }
            style={{
              fontFamily: "var(--font-sans)",
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              transition: "fill 250ms ease",
            }}
          >
            ↻ until no new handles discovered
          </text>

          {/* Output-guardrail annotation on the narrator → report edge.
              Centered on the arrow line — the card-colored fill hides
              the arrow segment behind the label so it reads cleanly. */}
          {(() => {
            const active = step >= stepForNode("narrator") + 1;
            const color = active
              ? "var(--color-warning)"
              : "var(--color-muted-foreground)";
            const centerY = (cy.narrator + cy.report) / 2;
            const boxW = 138;
            const boxH = 20;
            const boxX = cx.center - boxW / 2;
            const boxY = centerY - boxH / 2;
            return (
              <g style={{ transition: "opacity 250ms ease", opacity: active ? 1 : 0.6 }}>
                <rect
                  x={boxX}
                  y={boxY}
                  width={boxW}
                  height={boxH}
                  fill="var(--color-card)"
                />
                <text
                  x={cx.center}
                  y={centerY + 3.5}
                  textAnchor="middle"
                  fontSize={10}
                  fill={color}
                  style={{
                    fontFamily: "var(--font-sans)",
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                    transition: "fill 250ms ease",
                  }}
                >
                  output guardrails
                </text>
              </g>
            );
          })()}

          {/* Nodes */}
          {NODES.map((n) => (
            <Node key={n.id} node={n} active={step >= stepForNode(n.id) + 1} />
          ))}
        </svg>
      </div>

    </div>
  );
}

function Node({ node, active }: { node: NodeDef; active: boolean }) {
  const x = node.x - node.w / 2;
  const y = node.y - node.h / 2;
  const stroke =
    node.kind === "io"
      ? active
        ? "var(--color-foreground)"
        : "var(--color-muted-foreground)"
      : node.kind === "llm"
        ? "var(--color-warning)"
        : active
          ? "var(--color-primary)"
          : "var(--color-muted-foreground)";
  const fill =
    node.kind === "io"
      ? "var(--color-surface)"
      : node.kind === "llm"
        ? "var(--color-warning)"
        : "var(--color-card)";
  const fillOpacity = node.kind === "llm" ? (active ? 0.18 : 0.08) : 1;
  const opacity = active ? 1 : 0.42;
  const textColor =
    node.kind === "llm"
      ? "var(--color-warning)"
      : active
        ? "var(--color-foreground)"
        : "var(--color-muted-foreground)";
  return (
    <g style={{ opacity, transition: "opacity 250ms ease" }}>
      <rect
        x={x}
        y={y}
        width={node.w}
        height={node.h}
        rx={10}
        fill={fill}
        fillOpacity={fillOpacity}
        stroke={stroke}
        strokeWidth={active ? 2 : 1.25}
        style={{
          transition: "stroke 250ms ease, stroke-width 250ms ease, fill-opacity 250ms ease",
        }}
      />
      {active && node.kind !== "io" && (
        <rect
          x={x - 2}
          y={y - 2}
          width={node.w + 4}
          height={node.h + 4}
          rx={12}
          fill="none"
          stroke={node.kind === "llm" ? "var(--color-warning)" : "var(--color-primary)"}
          strokeOpacity={0.25}
          strokeWidth={4}
        />
      )}
      <text
        x={node.x}
        y={node.sub ? node.y - 3 : node.y + 4}
        textAnchor="middle"
        fontSize={12}
        fontWeight={600}
        fill={textColor}
        style={{
          fontFamily: "var(--font-sans)",
          transition: "fill 250ms ease",
        }}
      >
        {node.label}
      </text>
      {node.sub ? (
        <text
          x={node.x}
          y={node.y + 12}
          textAnchor="middle"
          fontSize={10}
          fill="var(--color-muted-foreground)"
          style={{ fontFamily: "var(--font-mono)" }}
        >
          {node.sub}
        </text>
      ) : null}
    </g>
  );
}

/**
 * Vertical-ish edge from one node's bottom to another's top, with a soft
 * bezier so the parallel fan-out/fan-in lines flow nicely.
 */
function Edge({
  fromNode,
  toNode,
  active,
}: {
  fromNode: NodeDef;
  toNode: NodeDef;
  active: boolean;
}) {
  const x1 = fromNode.x;
  const y1 = fromNode.y + fromNode.h / 2;
  const x2 = toNode.x;
  const y2 = toNode.y - toNode.h / 2 - 1;
  const dy = y2 - y1;
  const c1y = y1 + dy * 0.5;
  const c2y = y2 - dy * 0.5;
  const d = `M ${x1} ${y1} C ${x1} ${c1y}, ${x2} ${c2y}, ${x2} ${y2}`;
  const dashLen = Math.hypot(x2 - x1, y2 - y1) * 1.4 + 80;
  return (
    <path
      d={d}
      fill="none"
      stroke={active ? "var(--color-primary)" : "var(--color-muted-foreground)"}
      strokeOpacity={active ? 0.9 : 0.32}
      strokeWidth={active ? 1.8 : 1.25}
      strokeDasharray={dashLen}
      strokeDashoffset={active ? 0 : dashLen}
      markerEnd={active ? "url(#md-arrowhead-active)" : "url(#md-arrowhead)"}
      style={{
        transition: "stroke-dashoffset 700ms ease, stroke 250ms ease, stroke-opacity 250ms ease",
      }}
    />
  );
}

function LoopArc({
  active,
  x,
  yTop,
  xLeft,
  xRight,
}: {
  active: boolean;
  x: number;
  yTop: number;
  xLeft: number;
  xRight: number;
}) {
  // Self-loop: sweep down from the bottom-right of the pivot bracket,
  // arc under, and come up to the bottom-left — visualizes "go again".
  const d = `M ${x + 60} ${yTop}
             C ${xRight} ${yTop + 36}, ${xRight} ${yTop + 110}, ${x} ${yTop + 110}
             L ${x - 30} ${yTop + 110}
             C ${xLeft} ${yTop + 110}, ${xLeft} ${yTop + 36}, ${x - 60} ${yTop}`;
  const dashLen = 1400;
  return (
    <path
      d={d}
      fill="none"
      stroke={active ? "var(--color-primary)" : "var(--color-muted-foreground)"}
      strokeOpacity={active ? 0.7 : 0.22}
      strokeWidth={1.8}
      strokeDasharray={dashLen}
      strokeDashoffset={active ? 0 : dashLen}
      style={{
        transition: "stroke-dashoffset 800ms ease, stroke 250ms ease, stroke-opacity 250ms ease",
      }}
    />
  );
}

function PhaseGroup({
  x,
  y,
  w,
  h,
  label,
  highlight = false,
  active = false,
}: {
  x: number;
  y: number;
  w: number;
  h: number;
  label: string;
  highlight?: boolean;
  active?: boolean;
}) {
  const stroke = highlight ? "var(--color-primary)" : "var(--color-muted-foreground)";
  return (
    <g
      style={{
        opacity: active ? 0.85 : 0.42,
        transition: "opacity 250ms ease",
      }}
    >
      <rect
        x={x}
        y={y}
        width={w}
        height={h}
        rx={12}
        fill="none"
        stroke={stroke}
        strokeWidth={1}
        strokeDasharray="5 4"
        strokeOpacity={0.55}
      />
      <text
        x={x + 12}
        y={y - 10}
        fontSize={11}
        fontWeight={600}
        fill={stroke}
        style={{
          fontFamily: "var(--font-sans)",
          textTransform: "uppercase",
          letterSpacing: "0.08em",
        }}
      >
        {label}
      </text>
    </g>
  );
}

function LegendChip({ children, dotClass }: { children: React.ReactNode; dotClass: string }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span className={`inline-block h-3 w-3 rounded-sm border ${dotClass}`} />
      <span className="text-muted-foreground">{children}</span>
    </span>
  );
}
