/** Align dashboard + email: Metabase may return `1h 11m` or a numeric seconds value. */
export function formatAgentDurationDisplay(raw: string): string {
  const s = String(raw ?? "").trim();
  if (!s || s === "—") return "—";
  if (/[0-9]+\s*h/i.test(s) || /[0-9]+\s*m/i.test(s)) return s;
  const n = Number(s.replace(/,/g, ""));
  if (!Number.isFinite(n)) return "—";
  const totalMinutes = Math.floor(n / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours}h ${minutes}m`;
}

/** Parse Metabase `1h 11m` or seconds number for comparisons. */
export function parseAgentDurationToSeconds(raw: unknown): number | null {
  const s = String(raw ?? "").trim();
  if (!s || s === "—") return null;
  const hm = s.match(/(\d+)\s*h\s*(\d+)\s*m/i);
  if (hm) return parseInt(hm[1], 10) * 3600 + parseInt(hm[2], 10) * 60;
  const hOnly = s.match(/^(\d+)\s*h$/i);
  if (hOnly) return parseInt(hOnly[1], 10) * 3600;
  const mOnly = s.match(/^(\d+)\s*m$/i);
  if (mOnly) return parseInt(mOnly[1], 10) * 60;
  const n = Number(s.replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

/** Signed delta for subtitle, e.g. +15m or -1h 2m */
export function formatDurationDeltaSeconds(deltaSec: number): string {
  const sign = deltaSec >= 0 ? "+" : "-";
  const abs = Math.round(Math.abs(deltaSec));
  const h = Math.floor(abs / 3600);
  const m = Math.floor((abs % 3600) / 60);
  if (h > 0) return `${sign}${h}h ${m}m`;
  return `${sign}${m}m`;
}
