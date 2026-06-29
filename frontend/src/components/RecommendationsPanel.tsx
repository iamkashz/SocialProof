import { cn } from "@/lib/utils";
import { ListChecks } from "lucide-react";

/**
 * Shared "Recommendations" panel used on /sample and /scan/$id.
 *
 * Treated as the user-actionable conclusion of the report, so it gets
 * heavier visual weight than the surrounding panels: primary-tinted
 * border + soft primary background wash on the outer panel so the
 * section reads as "action lives here".
 *
 * Each row shows a sequential rank (1, 2, 3…) for ordering plus a
 * contextual severity pill (Critical / Important / Recommended /
 * Hygiene) that carries the urgency. The underlying `priority` field
 * from the analyst still drives the pill color and label — it just
 * isn't surfaced as a raw number, which would read as inconsistent
 * when a low-risk scan only fires the hygiene-tier recommendations
 * (priorities 4 and 5 with no 1-3 above them).
 */

export type Recommendation = {
  priority: number;
  title: string;
  detail: string;
};

function priorityClasses(priority: number): string {
  if (priority <= 1) return "border-destructive/50 bg-destructive/15 text-destructive";
  if (priority === 2) return "border-warning/50 bg-warning/15 text-warning";
  if (priority === 3) return "border-primary/50 bg-primary/15 text-primary";
  return "border-success/40 bg-success/10 text-success";
}

function priorityLabel(priority: number): string {
  if (priority <= 1) return "Critical";
  if (priority === 2) return "Important";
  if (priority === 3) return "Recommended";
  return "Hygiene";
}

export function RecommendationsPanel({ recommendations }: { recommendations: Recommendation[] }) {
  if (!recommendations.length) return null;
  return (
    <div className="rounded-xl border border-primary/30 bg-primary/5 p-6 shadow-sm shadow-primary/10">
      <div className="mb-4 flex items-center gap-2">
        <span className="grid h-7 w-7 place-items-center rounded-md bg-primary/15 text-primary">
          <ListChecks className="h-4 w-4" />
        </span>
        <h3 className="text-sm font-semibold uppercase tracking-widest text-primary">
          Recommendations
        </h3>
        <span className="ml-auto text-xs text-muted-foreground">
          Priority-ordered actions for this report
        </span>
      </div>
      <ol className="grid items-start gap-4 lg:grid-cols-2">
        {recommendations.map((r, i) => (
          <li
            key={i}
            className="flex gap-3 rounded-lg border border-border/60 bg-card/80 p-4 transition hover:border-primary/30"
          >
            <div className="grid h-9 w-9 shrink-0 place-items-center rounded-md border border-border/60 bg-surface/60 font-mono text-sm font-semibold text-muted-foreground">
              {i + 1}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <div className="text-sm font-medium">{r.title}</div>
                <span
                  className={cn(
                    "rounded-md border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider",
                    priorityClasses(r.priority),
                  )}
                >
                  {priorityLabel(r.priority)}
                </span>
              </div>
              <div className="mt-1.5 text-xs text-muted-foreground">{r.detail}</div>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
