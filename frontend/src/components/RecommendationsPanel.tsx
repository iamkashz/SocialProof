import { cn } from "@/lib/utils";
import { ListChecks } from "lucide-react";

/**
 * Shared "Recommendations" panel used on /sample and /scan/$id.
 *
 * Treated as the user-actionable conclusion of the report, so it gets
 * heavier visual weight than the surrounding panels:
 *   - Primary-tinted border + soft primary background wash on the outer
 *     panel so the section reads as "action lives here".
 *   - Each row has a numbered priority badge color-graded by P1 (red /
 *     critical) through P5 (success / nice-to-have). The body text stays
 *     neutral so it's still readable.
 *
 * The recommendation data is produced deterministically by the analyst
 * agent (`backend/app/osint/correlate.py`) — priorities are stable
 * integers, so the color grading is reproducible per recommendation.
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
            <div
              className={cn(
                "grid h-9 w-9 shrink-0 place-items-center rounded-md border font-mono text-sm font-semibold",
                priorityClasses(r.priority),
              )}
            >
              {r.priority}
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
