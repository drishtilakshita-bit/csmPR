import { getMetricConfig, METRIC_KEYS } from "@/lib/metrics-config";

export type ReportFilters = {
  account_id: string;
  start_date: string;
  end_date: string;
  deal_owner?: string;
  enterprise_midmarket?: string;
  reply_text?: string;
  month?: string;
};

type MetricApiResponse = {
  cols?: Array<{ name?: string; display_name?: string }>;
  rows?: unknown[][];
  error?: string;
};

export type ReportRow = {
  metricKey: string;
  metricLabel: string;
  value: string;
  cols?: string[];
  rows?: string[][];
};

const REPORT_METRIC_KEYS = METRIC_KEYS.filter(
  (k) =>
    ![
      "customer_success_summary",
      "acl_deal_owner_performance",
      "acl_complete",
      "deal_owner_account_type_distribution",
      "web_widget_type",
    ].includes(k)
);

const normalizeCol = (value: string) => value.toLowerCase().replace(/\s+/g, "_");
const parseNumber = (value: string): number | null => {
  const n = Number(String(value ?? "").replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? n : null;
};

const labelFromKey = (key: string) =>
  key
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());

const stringifyCell = (cell: unknown) =>
  cell == null ? "—" : typeof cell === "object" ? JSON.stringify(cell) : String(cell);

function metricValueToString(json: MetricApiResponse): string {
  const rows = json.rows ?? [];
  const cols = json.cols ?? [];
  if (!rows.length) return "—";
  if (rows.length === 1 && rows[0].length <= 1) return stringifyCell(rows[0][0]);
  if (rows.length === 1 && rows[0].length > 1) return stringifyCell(rows[0][rows[0].length - 1]);

  const header =
    cols.length > 0
      ? cols.map((c, i) => String(c.display_name ?? c.name ?? `col_${i + 1}`)).join(" | ")
      : "";
  const body = rows
    .slice(0, 8)
    .map((r) => r.map(stringifyCell).join(" | "))
    .join(" ; ");
  return header ? `${header} :: ${body}` : body;
}

export async function buildMetricsReport(
  origin: string,
  filters: ReportFilters
): Promise<ReportRow[]> {
  const reportRows: ReportRow[] = [];

  await Promise.all(
    REPORT_METRIC_KEYS.map(async (key) => {
      const metricConfig = getMetricConfig(key);
      const params = new URLSearchParams({
        account_id: filters.account_id,
        start_date: filters.start_date,
        end_date: filters.end_date,
        _: String(Date.now()),
      });
      if (metricConfig?.hasDealOwnerFilter && filters.deal_owner) {
        params.set("deal_owner", filters.deal_owner);
      }
      if (metricConfig?.hasEnterpriseMidmarketFilter && filters.enterprise_midmarket) {
        params.set("enterprise_midmarket", filters.enterprise_midmarket);
      }
      if (metricConfig?.hasReplyTextFilter && filters.reply_text) {
        params.set("reply_text", filters.reply_text);
      }
      if (metricConfig?.hasMonthFilter && filters.month) {
        params.set("month", filters.month);
      }

      try {
        const res = await fetch(`${origin}/api/metrics/${encodeURIComponent(key)}?${params}`, {
          cache: "no-store",
        });
        if (!res.ok) {
          reportRows.push({
            metricKey: key,
            metricLabel: labelFromKey(key),
            value: `Error: HTTP ${res.status}`,
          });
          return;
        }
        const json = (await res.json()) as MetricApiResponse;
        if (json.error) {
          reportRows.push({
            metricKey: key,
            metricLabel: labelFromKey(key),
            value: `Error: ${json.error}`,
          });
          return;
        }
        reportRows.push({
          metricKey: key,
          metricLabel: labelFromKey(key),
          value: metricValueToString(json),
          cols: (json.cols ?? []).map((c, i) => String(c.display_name ?? c.name ?? `col_${i + 1}`)),
          rows: (json.rows ?? []).map((r) => r.map((cell) => stringifyCell(cell))),
        });
      } catch (e) {
        reportRows.push({
          metricKey: key,
          metricLabel: labelFromKey(key),
          value: `Error: ${e instanceof Error ? e.message : "Failed to fetch"}`,
        });
      }
    })
  );

  const upsertRow = (row: ReportRow) => {
    const idx = reportRows.findIndex((r) => r.metricKey === row.metricKey);
    if (idx >= 0) reportRows[idx] = row;
    else reportRows.push(row);
  };

  const valueFor = (key: string) => reportRows.find((r) => r.metricKey === key)?.value ?? "—";

  // Ensure Widget Type is present for email body.
  try {
    const widgetRes = await fetch(
      `${origin}/api/widget?${new URLSearchParams({
        account_id: filters.account_id,
        _: String(Date.now()),
      }).toString()}`,
      { cache: "no-store" }
    );
    if (widgetRes.ok) {
      const widgetJson = (await widgetRes.json()) as { widgetType?: string | null };
      const widgetType = String(widgetJson.widgetType ?? "").trim() || "No widget";
      upsertRow({
        metricKey: "web_widget_type",
        metricLabel: "Web Widget Type",
        value: widgetType,
      });
    }
  } catch {
    // Best-effort fallback only.
  }

  // Derive total_revenue when card is absent/blank/error.
  const totalRevenueRaw = valueFor("total_revenue");
  const totalRevenueParsed = parseNumber(totalRevenueRaw);
  if (
    !totalRevenueRaw ||
    totalRevenueRaw === "—" ||
    totalRevenueRaw.startsWith("Error:") ||
    totalRevenueParsed === null
  ) {
    const bot = parseNumber(valueFor("revenue_total_bot")) ?? 0;
    const broadcast = parseNumber(valueFor("revenue_broadcast")) ?? 0;
    const flow = parseNumber(valueFor("revenue_flow")) ?? 0;
    const computed = bot + broadcast + flow;
    if (computed > 0) {
      upsertRow({
        metricKey: "total_revenue",
        metricLabel: "Total Revenue",
        value: String(computed),
      });
    }
  }

  // Derive ROI when missing: total_revenue / MRR from customer_success_summary.
  const roiRaw = valueFor("revenue_mrr_ratio");
  if (!roiRaw || roiRaw === "—" || roiRaw.startsWith("Error:")) {
    try {
      const params = new URLSearchParams({
        account_id: filters.account_id,
        month: filters.month || "February",
        _: String(Date.now()),
      });
      if (filters.deal_owner) params.set("deal_owner", filters.deal_owner);
      if (filters.enterprise_midmarket) params.set("enterprise_midmarket", filters.enterprise_midmarket);
      const roiRes = await fetch(
        `${origin}/api/metrics/customer_success_summary?${params.toString()}`,
        { cache: "no-store" }
      );
      if (roiRes.ok) {
        const roiJson = (await roiRes.json()) as MetricApiResponse;
        const cols = (roiJson.cols ?? []).map((c) => String(c.name ?? c.display_name ?? ""));
        const row = roiJson.rows?.[0] ?? [];
        const idxOf = (candidates: string[]) =>
          cols.findIndex((c) => candidates.includes(normalizeCol(c)));
        const mrrIdx = idxOf(["mrr_feb", "mrr", "mrr_jan"]);
        const mrr = mrrIdx >= 0 ? parseNumber(stringifyCell(row[mrrIdx])) : null;
        const totalRevenue = parseNumber(valueFor("total_revenue"));
        if (mrr && mrr > 0 && totalRevenue != null) {
          upsertRow({
            metricKey: "revenue_mrr_ratio",
            metricLabel: "Revenue Mrr Ratio",
            value: `${(totalRevenue / mrr).toFixed(2)}x`,
          });
        }
      }
    } catch {
      // Best-effort fallback only.
    }
  }

  return reportRows.sort((a, b) => a.metricLabel.localeCompare(b.metricLabel));
}

export function buildReportHtml(rows: ReportRow[], filters: ReportFilters): string {
  const escaped = (s: string) =>
    s
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  const tableRows = rows
    .map(
      (r) =>
        `<tr><td style="padding:8px;border:1px solid #e5e7eb;">${escaped(
          r.metricLabel
        )}</td><td style="padding:8px;border:1px solid #e5e7eb;">${escaped(r.value)}</td></tr>`
    )
    .join("");

  return `
  <div style="font-family: Inter, Arial, sans-serif; color:#111827;">
    <h2 style="margin:0 0 12px;">Metrics Overview Report</h2>
    <p style="margin:0 0 12px;font-size:12px;color:#4b5563;">
      Account ID: ${escaped(filters.account_id)} | Start: ${escaped(filters.start_date)} | End: ${escaped(
    filters.end_date
  )}
    </p>
    <table style="border-collapse:collapse;width:100%;font-size:12px;">
      <thead>
        <tr>
          <th style="text-align:left;padding:8px;border:1px solid #e5e7eb;background:#f8fafc;">Metric</th>
          <th style="text-align:left;padding:8px;border:1px solid #e5e7eb;background:#f8fafc;">Value</th>
        </tr>
      </thead>
      <tbody>${tableRows}</tbody>
    </table>
  </div>`;
}

export function buildReportText(rows: ReportRow[], filters: ReportFilters): string {
  const lines = rows.map((r) => `- ${r.metricLabel}: ${r.value}`);
  return [
    "Metrics Overview Report",
    `Account ID: ${filters.account_id}`,
    `Date range: ${filters.start_date} to ${filters.end_date}`,
    "",
    ...lines,
  ].join("\n");
}

export function buildReportCsv(rows: ReportRow[]): string {
  const esc = (s: string) => `"${String(s ?? "").replace(/"/g, '""')}"`;
  const header = `"Metric","Value"`;
  const body = rows.map((r) => `${esc(r.metricLabel)},${esc(r.value)}`).join("\n");
  return `${header}\n${body}\n`;
}
