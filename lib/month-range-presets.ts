import {
  endOfMonth,
  format,
  isSameMonth,
  parseISO,
  startOfMonth,
  subMonths,
} from "date-fns";

export type DashboardMonthPreset = "current" | "previous";

/** Full calendar month: first day → last day (local timezone). */
export function getDashboardMonthRange(
  preset: DashboardMonthPreset,
  now: Date = new Date()
): { start_date: string; end_date: string } {
  const ref = preset === "previous" ? subMonths(now, 1) : now;
  return {
    start_date: format(startOfMonth(ref), "yyyy-MM-dd"),
    end_date: format(endOfMonth(ref), "yyyy-MM-dd"),
  };
}

export function detectDashboardMonthPreset(
  start_date: string,
  end_date: string,
  now: Date = new Date()
): DashboardMonthPreset | null {
  const cur = getDashboardMonthRange("current", now);
  const prev = getDashboardMonthRange("previous", now);
  if (start_date === cur.start_date && end_date === cur.end_date) return "current";
  if (start_date === prev.start_date && end_date === prev.end_date) return "previous";
  return null;
}

/** If [start_date, end_date] is one full calendar month, return the prior month's range. */
export function getPriorFullMonthRange(
  startYmd: string,
  endYmd: string
): { start: string; end: string } | null {
  const s = parseISO(startYmd);
  const e = parseISO(endYmd);
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return null;
  if (!isSameMonth(s, e)) return null;
  const som = startOfMonth(s);
  const eom = endOfMonth(s);
  if (format(som, "yyyy-MM-dd") !== startYmd || format(eom, "yyyy-MM-dd") !== endYmd) {
    return null;
  }
  const priorMonth = subMonths(som, 1);
  return {
    start: format(startOfMonth(priorMonth), "yyyy-MM-dd"),
    end: format(endOfMonth(priorMonth), "yyyy-MM-dd"),
  };
}
