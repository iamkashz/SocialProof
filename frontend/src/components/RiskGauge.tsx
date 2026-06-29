import { cn } from "@/lib/utils";

export function RiskGauge({ score, severity }: { score: number; severity: string }) {
  const clamped = Math.max(0, Math.min(100, score));
  const color =
    clamped >= 75
      ? "text-destructive"
      : clamped >= 50
        ? "text-warning"
        : clamped >= 25
          ? "text-primary"
          : "text-success";
  const stroke =
    clamped >= 75
      ? "stroke-destructive"
      : clamped >= 50
        ? "stroke-warning"
        : clamped >= 25
          ? "stroke-primary"
          : "stroke-success";
  const r = 70;
  const c = 2 * Math.PI * r;
  const offset = c - (clamped / 100) * c;
  return (
    <div className="flex flex-col items-center gap-3">
      <div className="relative h-56 w-56">
        <svg viewBox="0 0 180 180" className="h-full w-full -rotate-90">
          <circle cx="90" cy="90" r={r} className="fill-none stroke-surface-2" strokeWidth="14" />
          <circle
            cx="90"
            cy="90"
            r={r}
            className={cn("fill-none transition-all duration-700 ease-out", stroke)}
            strokeWidth="14"
            strokeLinecap="round"
            strokeDasharray={c}
            strokeDashoffset={offset}
          />
        </svg>
        <div className="absolute inset-0 grid place-items-center">
          <div className="text-center">
            <div className={cn("font-mono text-6xl font-semibold tabular-nums", color)}>
              {clamped}
            </div>
            <div className="mt-1 text-[10px] uppercase tracking-widest text-muted-foreground">
              Risk score
            </div>
          </div>
        </div>
      </div>
      <div className="text-center">
        <div className="text-xs uppercase tracking-widest text-muted-foreground">Severity</div>
        <div className={cn("mt-1 text-3xl font-semibold", color)}>{severity}</div>
      </div>
    </div>
  );
}
