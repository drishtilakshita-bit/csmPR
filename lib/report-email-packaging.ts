import * as XLSX from "xlsx";
import type { ReportFilters, ReportRow } from "@/lib/report";
import type { ReportAttachment } from "@/lib/report-attachments";
import { formatAgentDurationDisplay } from "@/lib/agent-duration-format";

const BIG_TABLE_KEYS = new Set(["total_tickets_inbox_wise", "product_card_count"]);
const MAX_ATTACHMENT_ROWS = 1000;
const EMAIL_SECTIONS = [
  {
    title: "Web Widget",
    items: [{ key: "web_widget_type", label: "Widget Type" }],
  },
  {
    title: "ROI",
    items: [{ key: "revenue_mrr_ratio", label: "ROI" }],
  },
  {
    title: "Inbox :",
    items: [{ key: "total_tickets_retain_sure", label: "Total Tickets" }],
  },
  {
    title: "CSAT :",
    items: [
      { key: "bot_csat_score", label: "Bot CSAT" },
      { key: "total_bot_csat_responses", label: "No of people who participated in BOT CSAT" },
      { key: "agent_csat_score", label: "Agent CSAT" },
      { key: "total_agent_csat_responses", label: "No of people who participated in Agent CSAT" },
    ],
  },
  {
    title: "Revenue:",
    items: [
      { key: "total_revenue", label: "Total revenue" },
      { key: "revenue_total_bot", label: "Bot revenue" },
      { key: "revenue_direct_bot", label: "Bot direct revenue" },
      { key: "revenue_influenced_bot", label: "Bot influenced revenue" },
      { key: "revenue_broadcast", label: "Broadcast revenue" },
      { key: "revenue_flow", label: "Flow revenue" },
    ],
  },
  {
    title: "Orders :",
    items: [
      { key: "orders_placed_via_bot", label: "Orders placed via bot" },
      { key: "orders_placed_via_flows", label: "Orders placed via flows" },
      { key: "orders_placed_via_broadcasts", label: "Orders placed via broadcasts" },
    ],
  },
  {
    title: "Bot Overview :",
    items: [
      { key: "bot_total_tickets", label: "Total Bot Tickets" },
      { key: "bot_automation_percent", label: "Bot automation %" },
      { key: "buy_now_button_count", label: "Buy Now button count" },
      { key: "button_click_count", label: "Button Click Count" },
    ],
  },
  {
    title: "Agent Overview:",
    items: [
      { key: "agent_first_resolution_time", label: "First Resolution Time" },
      { key: "agent_resolution_time", label: "Resolution Time" },
      { key: "agent_wait_time", label: "Wait Time" },
      { key: "number_of_billable_agents", label: "Number of billable agents" },
    ],
  },
  {
    title: "Voice :",
    items: [
      { key: "voice_call_channel", label: "call_channel" },
      { key: "voice_total_calls", label: "total_calls" },
      { key: "voice_total_calling_minutes", label: "total_calling_minutes" },
      { key: "voice_acceptance_rate_pct", label: "Acceptance Rate %" },
    ],
  },
] as const;

function formatTwoDecimals(raw: string): string {
  const numeric = Number(String(raw ?? "").replace(/,/g, "").trim());
  return Number.isFinite(numeric) ? numeric.toFixed(2) : raw;
}

function formatInr(raw: string): string {
  const numeric = Number(String(raw ?? "").replace(/,/g, "").trim());
  if (!Number.isFinite(numeric)) return raw;
  return `₹ ${numeric.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatMetricValue(metricKey: string, value: string): string {
  if (
    metricKey === "agent_first_resolution_time" ||
    metricKey === "agent_resolution_time" ||
    metricKey === "agent_wait_time"
  ) {
    return formatAgentDurationDisplay(value);
  }
  if (
    metricKey === "total_revenue" ||
    metricKey === "revenue_total_bot" ||
    metricKey === "revenue_direct_bot" ||
    metricKey === "revenue_influenced_bot" ||
    metricKey === "revenue_broadcast" ||
    metricKey === "revenue_flow"
  ) {
    return formatInr(value);
  }
  return value;
}

export function buildOrderedMetricBodyLines(rows: ReportRow[]): string[] {
  const rowByKey = new Map(rows.map((row) => [row.metricKey, row]));
  const voice = extractVoiceValues(rowByKey.get("revenue_voice"));
  const voiceRows = extractVoiceRows(rowByKey.get("revenue_voice"));
  const lines: string[] = [];
  const renderedKeys = new Set<string>();

  for (const section of EMAIL_SECTIONS) {
    const showSectionTitle = section.title !== "Web Widget" && section.title !== "ROI";
    if (showSectionTitle) {
      lines.push(section.title);
    }
    if (section.title === "Voice :") {
      const rowsToRender =
        voiceRows.length > 0
          ? voiceRows
          : [
              {
                call_channel: voice.voice_call_channel,
                total_calls: voice.voice_total_calls,
                total_calling_minutes: voice.voice_total_calling_minutes,
                acceptance_rate_pct: voice.voice_acceptance_rate_pct,
              },
            ];
      for (const vr of rowsToRender) {
        lines.push(`Call Channel: ${vr.call_channel}`);
        lines.push(`Total Calls: ${vr.total_calls}`);
        lines.push(`Total Calling Minutes: ${vr.total_calling_minutes}`);
        lines.push(`Acceptance Rate %: ${vr.acceptance_rate_pct}`);
        lines.push("");
      }
      renderedKeys.add("voice_call_channel");
      renderedKeys.add("voice_total_calls");
      renderedKeys.add("voice_total_calling_minutes");
      renderedKeys.add("voice_acceptance_rate_pct");
      renderedKeys.add("revenue_voice");
      if (showSectionTitle) {
        lines.push("");
      }
      continue;
    }
    for (const item of section.items) {
      const rawValue =
        item.key.startsWith("voice_")
          ? voice[item.key] ?? "—"
          : rowByKey.get(item.key)?.value ?? "—";
      lines.push(`${item.label}: ${formatMetricValue(item.key, rawValue)}`);
      renderedKeys.add(item.key);
    }
    if (showSectionTitle) {
      lines.push("");
    }
  }

  lines.push("total tickets inbox wise and product card count are attached as Excel sheets.");
  return lines;
}

function formatDateForFilename(date: string): string {
  const [year, month, day] = date.split("-");
  if (!year || !month || !day) return date;
  return `${day}-${month}-${year}`;
}

function csvSafeCell(value: string): string {
  return String(value ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ");
}

export function splitInlineAndBigTableRows(rows: ReportRow[]): {
  inlineRows: ReportRow[];
  bigTableRows: ReportRow[];
} {
  const inlineRows: ReportRow[] = [];
  const bigTableRows: ReportRow[] = [];
  for (const row of rows) {
    if (BIG_TABLE_KEYS.has(row.metricKey)) bigTableRows.push(row);
    else inlineRows.push(row);
  }
  return { inlineRows, bigTableRows };
}

function normalizeColName(value: string): string {
  return value.toLowerCase().replace(/\s+/g, "_");
}

function extractVoiceValues(row: ReportRow | undefined): Record<string, string> {
  const out: Record<string, string> = {
    voice_call_channel: "—",
    voice_total_calls: "—",
    voice_total_calling_minutes: "—",
    voice_acceptance_rate_pct: "—",
  };
  if (!row?.cols || !row.rows || row.rows.length === 0) return out;
  const firstRow = row.rows[0];
  const colMap = new Map(row.cols.map((c, i) => [normalizeColName(c), i]));
  const pick = (candidates: string[]) => {
    for (const c of candidates) {
      const idx = colMap.get(normalizeColName(c));
      if (idx != null) {
        const value = String(firstRow[idx] ?? "").trim();
        if (value) return value;
      }
    }
    return "—";
  };
  out.voice_call_channel = pick(["call_channel", "channel", "call channel"]);
  out.voice_total_calls = pick(["total_calls", "calls", "total calls"]);
  out.voice_total_calling_minutes = pick([
    "total_calling_minutes",
    "total minutes",
    "calling_minutes",
  ]);
  out.voice_acceptance_rate_pct = pick([
    "acceptance_rate_pct",
    "acceptance rate %",
    "acceptance_rate",
  ]);
  return out;
}

function extractVoiceRows(row: ReportRow | undefined): Array<{
  call_channel: string;
  total_calls: string;
  total_calling_minutes: string;
  acceptance_rate_pct: string;
}> {
  if (!row?.cols || !row.rows || row.rows.length === 0) return [];
  const colMap = new Map(row.cols.map((c, i) => [normalizeColName(c), i]));
  const pick = (cells: string[], candidates: string[]) => {
    for (const c of candidates) {
      const idx = colMap.get(normalizeColName(c));
      if (idx != null) {
        const value = String(cells[idx] ?? "").trim();
        if (value) return value;
      }
    }
    return "—";
  };
  return row.rows.map((cells) => ({
    call_channel: pick(cells, ["call_channel", "channel", "call channel"]),
    total_calls: pick(cells, ["total_calls", "calls", "total calls"]),
    total_calling_minutes: pick(cells, ["total_calling_minutes", "total minutes", "calling_minutes"]),
    acceptance_rate_pct: pick(cells, ["acceptance_rate_pct", "acceptance rate %", "acceptance_rate"]),
  }));
}

export function buildMarkdownReport(
  filters: ReportFilters,
  inlineRows: ReportRow[],
  bigTableRows: ReportRow[]
): string {
  const lines: string[] = [
    "# Metrics Overview Report",
    "",
    `- Account ID: ${filters.account_id}`,
    `- Date range: ${filters.start_date} to ${filters.end_date}`,
    "",
    "## Metrics",
    "",
  ];

  const visibleRows = inlineRows.filter(
    (row) => row.value && row.value !== "—" && !row.value.startsWith("Error:")
  );

  for (const row of visibleRows) {
    lines.push(`### ${row.metricLabel}`);
    if (row.cols && row.rows && row.cols.length > 0 && row.rows.length > 0) {
      lines.push(`| ${row.cols.map(csvSafeCell).join(" | ")} |`);
      lines.push(`| ${row.cols.map(() => "---").join(" | ")} |`);
      for (const cells of row.rows.slice(0, 20)) {
        lines.push(`| ${cells.map(csvSafeCell).join(" | ")} |`);
      }
    } else {
      lines.push(String(row.value));
    }
    lines.push("");
  }

  if (bigTableRows.length > 0) {
    lines.push("## Large tables attached as Excel");
    lines.push("");
    for (const row of bigTableRows) {
      lines.push(`- ${row.metricLabel} (attached as .xlsx)`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

function getBigTableMatrix(row: ReportRow): { headers: string[]; body: string[][] } {
  const sourceCols =
    row.cols && row.cols.length > 0 ? row.cols : ["Info"];
  const sourceRows =
    row.rows && row.rows.length > 0
      ? row.rows.slice(0, MAX_ATTACHMENT_ROWS)
      : [[row.value && row.value !== "—" ? row.value : "No data for selected filters"]];
  const normalizedCols = sourceCols.map((c) => normalizeColName(c));
  const mappedHeaders =
    row.metricKey === "product_card_count"
      ? normalizedCols.map((col) => {
          if (col.includes("product") && col.includes("name")) return "Product Name";
          if (col.includes("product") && (col.includes("count") || col.includes("card"))) {
            return "Product Count";
          }
          return col.replace(/_/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());
        })
      : sourceCols.map((c) => String(c));
  const body = sourceRows.map((r) => {
    const cells = r.map((c) => String(c ?? ""));
    const out = [...cells];
    while (out.length < mappedHeaders.length) out.push("");
    return out.slice(0, mappedHeaders.length);
  });
  return { headers: mappedHeaders, body };
}

function safeFilenamePart(s: string): string {
  return String(s).replace(/[^a-zA-Z0-9._-]+/g, "_");
}

function buildTableExcelAttachment(filters: ReportFilters, row: ReportRow): ReportAttachment | null {
  const { headers, body } = getBigTableMatrix(row);
  const aoa = [headers, ...body];
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  XLSX.utils.book_append_sheet(wb, ws, "Data");
  const contentBase64 = XLSX.write(wb, { type: "base64", bookType: "xlsx" });
  const start = formatDateForFilename(filters.start_date);
  const end = formatDateForFilename(filters.end_date);
  const base = `${safeFilenamePart(filters.account_id)}_${row.metricKey}_${start}_${end}`;
  return {
    label: `${row.metricLabel} (Excel)`,
    filename: `${base}.xlsx`,
    mimeType:
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    contentBase64,
  };
}

/** Rebuild one of the two big-table Excel files from a full `buildMetricsReport` result. */
export function buildExcelAttachmentForMetricKey(
  filters: ReportFilters,
  metricKey: "total_tickets_inbox_wise" | "product_card_count",
  allReportRows: ReportRow[]
): ReportAttachment | null {
  const { bigTableRows } = splitInlineAndBigTableRows(allReportRows);
  const byKey = new Map(bigTableRows.map((r) => [r.metricKey, r]));
  const fallback =
    metricKey === "product_card_count"
      ? {
          metricKey: "product_card_count" as const,
          metricLabel: "Product Card Count",
          value: "No data for selected filters",
          cols: ["Product Name", "Product Count"],
          rows: [] as string[][],
        }
      : {
          metricKey: "total_tickets_inbox_wise" as const,
          metricLabel: "Total Tickets Inbox Wise",
          value: "No data for selected filters",
          cols: ["Inbox", "Tickets"],
          rows: [] as string[][],
        };
  const row = byKey.get(metricKey) ?? fallback;
  return buildTableExcelAttachment(filters, row);
}

export function buildBigTableExcelAttachments(
  filters: ReportFilters,
  bigTableRows: ReportRow[]
): ReportAttachment[] {
  const byKey = new Map(bigTableRows.map((r) => [r.metricKey, r]));
  const required: ReportRow[] = [
    byKey.get("total_tickets_inbox_wise") ?? {
      metricKey: "total_tickets_inbox_wise",
      metricLabel: "Total Tickets Inbox Wise",
      value: "No data for selected filters",
      cols: ["Inbox", "Tickets"],
      rows: [],
    },
    byKey.get("product_card_count") ?? {
      metricKey: "product_card_count",
      metricLabel: "Product Card Count",
      value: "No data for selected filters",
      cols: ["Product Name", "Product Count"],
      rows: [],
    },
  ];
  return required
    .map((r) => buildTableExcelAttachment(filters, r))
    .filter((attachment): attachment is ReportAttachment => attachment !== null);
}

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function buildDashboardBlockHtmlEmail(input: {
  subject: string;
  introBody: string;
  rows: ReportRow[];
}): string {
  const rowByKey = new Map(input.rows.map((row) => [row.metricKey, row]));
  const voice = extractVoiceValues(rowByKey.get("revenue_voice"));
  const introHtml = escapeHtml(input.introBody).replace(/\n/g, "<br/>");
  const sectionsHtml = EMAIL_SECTIONS.map((section) => {
    const cards = section.items
      .map((item) => {
        const rawValue =
          item.key.startsWith("voice_")
            ? voice[item.key] ?? "—"
            : rowByKey.get(item.key)?.value ?? "—";
        const value = formatMetricValue(item.key, rawValue);
        return `<div style="background:#ffffff;border:1px solid #e5ebd8;border-radius:10px;padding:12px 14px;min-height:72px;">
          <p style="margin:0;color:#6b7280;font-size:12px;font-weight:600;">${escapeHtml(
            item.label
          )}</p>
          <p style="margin:8px 0 0;color:#111827;font-size:18px;font-weight:700;line-height:1.2;">${escapeHtml(
            value
          )}</p>
        </div>`;
      })
      .join("");
    return `<div style="margin-top:14px;">
      <p style="margin:0 0 8px;font-size:14px;font-weight:800;color:#111827;">${escapeHtml(
        section.title
      )}</p>
      <div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;">
        ${cards}
      </div>
    </div>`;
  }).join("");

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(input.subject)}</title>
  </head>
  <body style="font-family: Inter, Arial, sans-serif;background:#f6f9f2;color:#111827;margin:0;padding:24px;">
    <div style="max-width:860px;margin:0 auto;background:#ffffff;border:1px solid #e5ebd8;border-radius:14px;padding:20px;">
      <h2 style="margin:0 0 10px;color:#3f6212;">${escapeHtml(input.subject)}</h2>
      <div style="font-size:14px;line-height:1.6;">${introHtml}</div>
      <div style="margin-top:16px;padding-top:14px;border-top:1px solid #e5ebd8;">
        ${sectionsHtml}
      </div>
    </div>
  </body>
</html>`;
}

