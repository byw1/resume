import Link from "next/link";
import { ArrowRightIcon } from "lucide-react";
import type { SearchDiagnosis } from "@/lib/data/pipeline";
import { STAGE_LABEL, STAGE_TONE } from "@/lib/data/pipeline";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/**
 * What is wrong, in a sentence.
 *
 * The rates are underneath rather than above on purpose. Six numbers with no
 * reading is what every job tracker already shows, and interpreting them is the
 * work — so the tool does that part and shows its working below.
 */
export function DiagnosisCard({ diagnosis }: { diagnosis: SearchDiagnosis }) {
  const { steps, weakest, headline, detail, velocity, byResume, stalled } = diagnosis;
  const busiest = Math.max(1, ...velocity.map((week) => week.count));

  return (
    <Card>
      <CardContent className="space-y-4 px-5 py-4">
        <div>
          <div className="text-faint mb-1.5 text-[11px] font-medium tracking-[0.06em] uppercase">
            What&apos;s working
          </div>
          <h2 className="text-[17px] leading-snug font-semibold tracking-tight">{headline}</h2>
          <p className="text-muted-foreground mt-1 max-w-2xl text-[13px] leading-relaxed">
            {detail}
          </p>
        </div>

        {steps.some((step) => step.reached > 0) && (
          <div className="space-y-1">
            {steps.map((step) => {
              const isWeak = step.from === weakest;
              return (
                <div
                  key={step.from}
                  style={{ ["--tone" as string]: STAGE_TONE[step.from] }}
                  className={cn(
                    "flex items-center gap-3 rounded-control px-2 py-1.5",
                    isWeak && "stage-chip",
                  )}
                >
                  <span className="text-muted-foreground w-48 shrink-0 truncate text-[12.5px]">
                    {STAGE_LABEL[step.from]} → {STAGE_LABEL[step.to]}
                  </span>
                  <span className="nums text-faint w-16 shrink-0 text-[12px]">
                    {step.advanced} of {step.reached}
                  </span>
                  <span
                    className={cn(
                      "nums w-10 shrink-0 text-right text-[12.5px]",
                      isWeak ? "font-semibold" : "text-muted-foreground",
                    )}
                  >
                    {step.rate === null ? "—" : `${step.rate}%`}
                  </span>
                  <span className="bg-inset relative hidden h-1.5 min-w-0 flex-1 overflow-hidden rounded-full sm:block">
                    <span
                      className="absolute inset-y-0 left-0 rounded-full"
                      style={{
                        width: `${step.rate ?? 0}%`,
                        background: STAGE_TONE[step.from],
                      }}
                    />
                  </span>
                  {/* A zero-day median means "moved the same day", which is
                      not a useful thing to print on every row. */}
                  <span className="nums text-faint hidden w-20 shrink-0 text-right text-[11.5px] lg:block">
                    {step.medianDays ? `${step.medianDays}d median` : ""}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <div className="text-faint mb-1.5 text-[11px] font-medium tracking-[0.06em] uppercase">
              Sent, by week
            </div>
            <div className="flex items-end gap-1.5">
              {velocity.map((week, index) => (
                <div key={week.weekStart} className="flex min-w-0 flex-1 flex-col items-center gap-1">
                  <span className="nums text-faint text-[11px]">{week.count || ""}</span>
                  <span
                    className={cn(
                      "w-full rounded-t-[3px]",
                      index === velocity.length - 1 ? "bg-primary" : "bg-stage-muted",
                    )}
                    style={{
                      height: `${Math.max(2, (week.count / busiest) * 34)}px`,
                      background:
                        index === velocity.length - 1 ? "var(--primary)" : "var(--stage-2)",
                    }}
                  />
                </div>
              ))}
            </div>
            <div className="text-faint mt-1 text-[11px]">Six weeks, this week on the right</div>
          </div>

          {byResume.length > 0 && (
            <div>
              <div className="text-faint mb-1.5 text-[11px] font-medium tracking-[0.06em] uppercase">
                By resume
              </div>
              <ul className="space-y-1">
                {byResume.slice(0, 3).map((resume) => (
                  <li key={resume.id} className="flex items-center gap-2">
                    <Link
                      href={`/resumes/${resume.id}`}
                      className="min-w-0 flex-1 truncate text-[12.5px] hover:underline"
                    >
                      {resume.name}
                    </Link>
                    <span className="nums text-faint shrink-0 text-[11.5px]">
                      {resume.responded}/{resume.sent}
                    </span>
                    <span className="nums w-10 shrink-0 text-right text-[12.5px] font-medium">
                      {resume.rate === null ? "—" : `${resume.rate}%`}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {stalled.length > 0 && (
          <div className="border-t pt-3">
            <div className="flex items-center gap-2">
              <span className="text-[12.5px] font-medium">
                {stalled.length} gone quiet
              </span>
              <span className="text-faint text-[12px]">
                — nothing logged in{" "}
                {stalled[0].days === stalled[stalled.length - 1].days
                  ? `${stalled[0].days} days`
                  : `${stalled[stalled.length - 1].days}–${stalled[0].days} days`}
              </span>
              <Link
                href="/applications?view=list&f=overdue"
                className="text-muted-foreground hover:text-foreground ml-auto flex items-center gap-1 text-[12px] transition-colors"
              >
                Chase them <ArrowRightIcon className="size-3" />
              </Link>
            </div>
            <ul className="mt-1.5 flex flex-wrap gap-1.5">
              {stalled.slice(0, 6).map((row) => (
                <li key={row.id}>
                  <Link
                    href={`/applications/${row.id}`}
                    className="bg-inset shadow-hairline hover:bg-accent flex items-center gap-1.5 rounded-chip px-2 py-1 text-[12px] transition-colors"
                  >
                    <span className="truncate">{row.company}</span>
                    <span className="nums text-faint">{row.days}d</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
