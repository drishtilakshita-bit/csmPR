"use client";

import * as React from "react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from "recharts";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { FilterValues } from "./FilterBar";
import { cn } from "@/lib/utils";
import {
  formatAgentDurationDisplay,
  formatDurationDeltaSeconds,
  parseAgentDurationToSeconds,
} from "@/lib/agent-duration-format";
import { getPriorFullMonthRange } from "@/lib/month-range-presets";

export type MetricCardType = "number" | "table" | "chart" | "summary";

export interface MetricMeta {
  key: string;
  label: string;
  cardType: MetricCardType;
  hasDateFilters?: boolean;
  section?: string;
  isCurrency?: boolean;
  accountIdTag?: string;
  hasAccountIdFilter?: boolean;
  optionalAccountId?: boolean;
  hasDealOwnerFilter?: boolean;
  dealOwnerTag?: string;
  hasEnterpriseMidmarketFilter?: boolean;
  enterpriseMidmarketTag?: string;
  hasReplyTextFilter?: boolean;
  replyTextTag?: string;
  hasMonthFilter?: boolean;
  monthTag?: string;
  requiresEndDateOnly?: boolean;
  endDateTag?: string;
  columnLabels?: string[];
  columnLabelMap?: Record<string, string>;
  compareToPreviousMonth?: boolean;
}

interface MetricCardProps {
  metric: MetricMeta;
  filters: FilterValues;
  hideHeader?: boolean;
  onTableRowClick?: (row: Record<string, unknown>) => void;
}

interface ApiResponse {
  cols: Array<{ name: string; display_name: string }>;
  rows: unknown[][];
}

const CHART_COLORS = [
  "#22c55e",
  "#3b82f6",
  "#f59e0b",
  "#8b5cf6",
  "#06b6d4",
  "#ec4899",
  "#14b8a6",
  "#a855f7",
  "#f97316",
  "#0ea5e9",
];

function MetricNumber({
  value,
  isCurrency,
  suffix,
  className,
}: {
  value: unknown;
  isCurrency?: boolean;
  suffix?: string;
  className?: string;
}) {
  let str: string;
  if (typeof value === "number") {
    const formatted = value.toLocaleString("en-IN");
    str = isCurrency ? `₹ ${formatted}` : formatted;
  } else if (value != null) {
    str = String(value);
  } else {
    str = "—";
  }
  return (
    <p className={cn("text-3xl font-semibold tabular-nums tracking-tight whitespace-nowrap", className)}>
      {str}{suffix ? ` ${suffix}` : ""}
    </p>
  );
}

/** Summary cards from first row with flexible column-name matching. */
type TrendState = "rise" | "dip" | "stable";

function MetricSummary({
  cols,
  rows,
  month,
}: {
  cols: ApiResponse["cols"];
  rows: ApiResponse["rows"];
  month?: string;
}) {
  const row = rows?.[0];
  if (!row?.length) {
    return <p className="text-sm text-muted-foreground">No data.</p>;
  }
  const normalize = (s: string) => s.toLowerCase().replace(/\s+/g, "_");
  const colIndex = (name: string) =>
    cols.findIndex((c) => {
      const n = normalize(c.name || "");
      const d = normalize(c.display_name || "");
      return n === name || d === name || n.includes(name) || d.includes(name);
    });
  const idxAny = (names: string[]) => {
    for (const n of names) {
      const i = colIndex(n);
      if (i >= 0) return i;
    }
    return -1;
  };
  const v = (i: number) => {
    if (i < 0 || row[i] == null) return 0;
    const raw = row[i];
    if (typeof raw === "number") return Number.isFinite(raw) ? raw : 0;
    const parsed = Number(String(raw).replace(/,/g, ""));
    return Number.isFinite(parsed) ? parsed : 0;
  };
  const selectedMonth = (month || "").trim().toLowerCase();
  const monthKey = selectedMonth === "january" ? "jan" : selectedMonth === "february" ? "feb" : "";

  const monthValue = (monthNames: string[], genericNames: string[] = []) => {
    const keys = monthKey
      ? [...monthNames.map((n) => `${n}_${monthKey}`), ...genericNames]
      : [...monthNames.flatMap((n) => [`${n}_feb`, `${n}_jan`]), ...genericNames];
    return v(idxAny(keys));
  };
  const janValue = (names: string[], genericNames: string[] = []) =>
    v(idxAny([...names.map((n) => `${n}_jan`), ...genericNames]));

  const totalActive = monthValue(["total_active_accounts"], ["total_active"]);
  const platformFee = monthValue(
    ["contract_revenue_platform_fee"],
    ["contract_revenue_platform_fee", "platform_fee"]
  );
  const enterpriseRevenue = monthValue(["enterprise_revenue"]);
  const midMarketRevenue = monthValue(["mid_market_revenue"]);
  const mrr = monthValue(["mrr"], ["mrr_feb", "mrr_jan"]) || (enterpriseRevenue !== 0 ? enterpriseRevenue : midMarketRevenue);
  const botRevenue = monthValue(["contract_revenue_bot"], ["bot_revenue"]);
  const agentRevenue = monthValue(["contract_revenue_agent"], ["agent_revenue"]);
  const outboundRevenue = monthValue(["contract_revenue_outbound"], ["outbound"]);
  const voiceRevenue = monthValue(["contract_revenue_voice"], ["voice"]);

  const trendFor = (current: number, jan: number) => {
    const delta = current - jan;
    const pct = jan === 0 ? (current === 0 ? 0 : 100) : (delta / jan) * 100;
    const state: TrendState = Math.abs(delta) < 1e-9 ? "stable" : delta > 0 ? "rise" : "dip";
    return { delta, pct, state };
  };
  const showTrend = monthKey === "feb";
  const trendStyles: Record<TrendState, string> = {
    rise: "text-emerald-700 bg-emerald-50 border-emerald-200",
    dip: "text-red-700 bg-red-50 border-red-200",
    stable: "text-slate-700 bg-slate-100 border-slate-200",
  };
  const trendLabel: Record<TrendState, string> = {
    rise: "Up",
    dip: "Down",
    stable: "Stable",
  };
  const trendArrow: Record<TrendState, string> = {
    rise: "↑",
    dip: "↓",
    stable: "→",
  };
  const cards = [
    {
      label: "Total Active Accounts",
      value: totalActive,
      jan: janValue(["total_active_accounts"], ["total_active"]),
      isCurrency: false,
    },
    {
      label: "MRR",
      value: mrr,
      jan: janValue(["mrr"]) || janValue(["enterprise_revenue"]) || janValue(["mid_market_revenue"]),
      isCurrency: true,
    },
    {
      label: "Platform Fee",
      value: platformFee,
      jan: janValue(
        ["contract_revenue_platform_fee"],
        ["contract_revenue_platform_fee", "platform_fee"]
      ),
      isCurrency: true,
    },
    {
      label: "Bot",
      value: botRevenue,
      jan: janValue(["contract_revenue_bot"], ["bot_revenue"]),
      isCurrency: true,
    },
    {
      label: "Agent",
      value: agentRevenue,
      jan: janValue(["contract_revenue_agent"], ["agent_revenue"]),
      isCurrency: true,
    },
    {
      label: "Outbound",
      value: outboundRevenue,
      jan: janValue(["contract_revenue_outbound"], ["outbound"]),
      isCurrency: true,
    },
    {
      label: "Voice",
      value: voiceRevenue,
      jan: janValue(["contract_revenue_voice"], ["voice"]),
      isCurrency: true,
    },
  ];
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map((c) => (
        <div key={c.label} className="rounded-xl border bg-card p-4 min-h-[148px] flex flex-col justify-between">
          <p className="text-sm font-medium text-muted-foreground leading-5 min-h-[20px]">
            {c.label}
          </p>
          <MetricNumber value={c.value} isCurrency={c.isCurrency} className="text-[2rem] leading-tight whitespace-nowrap" />
          {showTrend && (
            <p className="text-[11px] text-muted-foreground">
              Jan:{" "}
              {c.isCurrency
                ? `₹ ${c.jan.toLocaleString("en-IN")}`
                : c.jan.toLocaleString("en-IN")}
            </p>
          )}
          {showTrend && (() => {
            const t = trendFor(c.value, c.jan);
            const sign = t.delta > 0 ? "+" : t.delta < 0 ? "-" : "";
            return (
              <p
                className={cn(
                  "mt-2 inline-flex items-center rounded-md border px-2 py-1 text-xs font-medium w-fit",
                  trendStyles[t.state]
                )}
              >
                <span className="mr-1 text-sm leading-none">{trendArrow[t.state]}</span>
                {trendLabel[t.state]} {sign}{t.pct.toFixed(1)}% ({sign}
                {c.isCurrency
                  ? `₹${Math.abs(t.delta).toLocaleString("en-IN")}`
                  : Math.abs(t.delta).toLocaleString("en-IN")}
                ) vs Jan
              </p>
            );
          })()}
        </div>
      ))}
    </div>
  );
}

function MetricTable({
  cols,
  rows,
  columnLabels,
  columnLabelMap,
  metricKey,
  onRowClick,
  emphasizedHeader,
  hideDealOwnerColumn,
}: {
  cols: ApiResponse["cols"];
  rows: ApiResponse["rows"];
  columnLabels?: string[];
  columnLabelMap?: Record<string, string>;
  metricKey?: string;
  onRowClick?: (row: Record<string, unknown>) => void;
  emphasizedHeader?: boolean;
  hideDealOwnerColumn?: boolean;
}) {
  const [page, setPage] = React.useState(0);
  const pageSize = 10;
  const pageCount = Math.ceil(rows.length / pageSize);
  React.useEffect(() => {
    setPage(0);
  }, [metricKey, rows.length]);
  const headers =
    cols.length > 0
      ? cols.map((c, i) =>
          columnLabelMap?.[c.name] ?? columnLabels?.[i] ?? c.display_name ?? c.name
        )
      : (rows[0]?.map((_, i) => columnLabels?.[i] ?? `Col ${i + 1}`) as string[]) ?? [];
  const visibleIndices = React.useMemo(() => {
    const all = Array.from({ length: headers.length }, (_, i) => i);
    return all.filter((i) => {
      const key = (cols[i]?.name || headers[i] || "").toLowerCase();
      if (hideDealOwnerColumn && (key.includes("deal_owner") || key.includes("deal owner"))) {
        return false;
      }
      // Voice output should not show company name column.
      if (metricKey === "revenue_voice" && (key.includes("company_name") || key.includes("company name"))) {
        return false;
      }
      if (metricKey === "revenue_voice" && (key.includes("voice_revenue") || key.includes("voice revenue"))) {
        return false;
      }
      return true;
    });
  }, [hideDealOwnerColumn, headers, cols, metricKey]);
  const trendColIndex = cols.findIndex((c) => {
    const n = (c.name || "").toLowerCase();
    const d = (c.display_name || "").toLowerCase();
    return n.includes("mrr_trend") || d.includes("mrr_trend") || d.includes("mrr trend");
  });
  const sortedRows = React.useMemo(() => {
    if (trendColIndex < 0) return rows;
    return [...rows].sort((a, b) => {
      const av = Number(String(a[trendColIndex] ?? "0").replace("%", "").trim());
      const bv = Number(String(b[trendColIndex] ?? "0").replace("%", "").trim());
      const an = Number.isFinite(av) ? av : 0;
      const bn = Number.isFinite(bv) ? bv : 0;
      return bn - an; // increase first, then decrease
    });
  }, [rows, trendColIndex]);

  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">No rows returned.</p>;
  }

  const colKey = (i: number) => (cols[i]?.name || headers[i] || "").toLowerCase();
  const headClass = (i: number) => {
    const k = colKey(i);
    if (k.includes("account name") || k.includes("account_name")) return "min-w-[220px] whitespace-normal";
    if (k.includes("products")) return "min-w-[260px] whitespace-normal";
    if (k.includes("deal owner") || k.includes("deal_owner")) return "min-w-[180px] whitespace-nowrap";
    if (k.includes("enterprise") || k.includes("mid market") || k.includes("enterprise_midmarket")) return "min-w-[180px] whitespace-nowrap";
    if (k.includes("type of bot") || k.includes("type_of_bot")) return "min-w-[140px] whitespace-nowrap";
    return "min-w-[120px] whitespace-nowrap";
  };
  const cellClass = (i: number) => {
    const k = colKey(i);
    if (k.includes("account name") || k.includes("account_name") || k.includes("products")) {
      return "py-2 whitespace-normal break-words";
    }
    return "py-2 whitespace-nowrap";
  };
  const isMomColumn = (i: number) => {
    const k = colKey(i);
    return (
      k.includes("mom_pct") ||
      k.includes("mom %") ||
      k === "mom" ||
      k.includes("mrr_trend") ||
      k.includes("mrr trend")
    );
  };
  const isDealOwnerColumn = (i: number) => {
    const k = colKey(i);
    return k.includes("deal_owner");
  };
  const isAccountNameColumn = (i: number) => {
    const k = colKey(i);
    return k.includes("account_name") || k.includes("account name");
  };
  const isDistributionPctColumn = (i: number) => {
    const k = colKey(i);
    return k.includes("distribution") && k.includes("pct");
  };
  const isCallingMinutesColumn = (i: number) => {
    const k = colKey(i);
    return k.includes("total_calling_minutes") || k.includes("calling minutes");
  };
  const isAcceptanceRateColumn = (i: number) => {
    const k = colKey(i);
    return k.includes("acceptance_rate_pct") || k.includes("acceptance rate");
  };
  const isMrrColumn = (i: number) => {
    const k = colKey(i);
    return k === "mrr" || k.includes("mrr_feb") || k.includes("mrr_jan") || k.includes("mrr feb") || k.includes("mrr jan");
  };
  const isChangeReasonColumn = (i: number) => {
    const k = colKey(i);
    return k.includes("change_reason") || k.includes("change reason");
  };
  const isAccountTypeColumn = (i: number) => {
    const k = colKey(i);
    return k.includes("account_type") || k.includes("account type");
  };
  const renderCell = (cell: unknown, colIdx: number) => {
    if (isDealOwnerColumn(colIdx) || isAccountNameColumn(colIdx)) {
      const valueStr = cell != null && typeof cell === "object" ? JSON.stringify(cell) : String(cell ?? "—");
      if (!onRowClick) {
        return valueStr;
      }
      return (
        <span className={cn("text-primary font-medium underline underline-offset-2 hover:no-underline")}>
          {valueStr}
        </span>
      );
    }
    if (isMrrColumn(colIdx)) {
      const raw = cell == null ? NaN : Number(String(cell).replace(/,/g, "").trim());
      if (Number.isFinite(raw)) {
        return `₹ ${raw.toLocaleString("en-IN")}`;
      }
      return cell != null && typeof cell === "object" ? JSON.stringify(cell) : String(cell ?? "—");
    }
    if (isAccountTypeColumn(colIdx)) {
      const valueStr = cell != null && typeof cell === "object" ? JSON.stringify(cell) : String(cell ?? "—");
      const key = valueStr.trim().toLowerCase();
      const tone =
        key === "platinum"
          ? "border-indigo-200 bg-indigo-50 text-indigo-700"
          : key === "gold"
            ? "border-amber-200 bg-amber-50 text-amber-700"
            : key === "silver"
              ? "border-slate-200 bg-slate-100 text-slate-700"
              : key === "bronze"
                ? "border-orange-200 bg-orange-50 text-orange-700"
                : key === "self serve"
                  ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                  : "border-slate-200 bg-slate-100 text-slate-700";
      return (
        <span className={cn("inline-flex rounded-full border px-2 py-0.5 text-xs font-medium", tone)}>
          {valueStr}
        </span>
      );
    }
    if (isChangeReasonColumn(colIdx)) {
      const valueStr = cell != null && typeof cell === "object" ? JSON.stringify(cell) : String(cell ?? "—");
      if (!valueStr || valueStr === "—") return valueStr;
      const parts = valueStr.split("|").map((p) => p.trim()).filter(Boolean);
      return (
        <span className="inline-flex flex-wrap items-center gap-x-1.5 gap-y-1">
          {parts.map((part, idx) => {
            const isUp = part.includes("▲");
            const isDown = part.includes("▼");
            const tone = isUp ? "text-emerald-700" : isDown ? "text-red-700" : "text-foreground";
            return (
              <React.Fragment key={`${part}-${idx}`}>
                <span className={cn("font-medium", tone)}>{part}</span>
                {idx < parts.length - 1 && <span className="text-muted-foreground">|</span>}
              </React.Fragment>
            );
          })}
        </span>
      );
    }
    if (isDistributionPctColumn(colIdx)) {
      const raw = cell == null ? NaN : Number(String(cell).replace("%", "").trim());
      if (Number.isFinite(raw)) return `${raw.toFixed(2)}%`;
      return cell != null && typeof cell === "object" ? JSON.stringify(cell) : String(cell ?? "—");
    }
    if (isCallingMinutesColumn(colIdx)) {
      const raw = cell == null ? NaN : Number(String(cell).replace(/,/g, "").trim());
      if (Number.isFinite(raw)) return `${raw.toLocaleString("en-IN")} m`;
      return cell != null && typeof cell === "object" ? JSON.stringify(cell) : String(cell ?? "—");
    }
    if (isAcceptanceRateColumn(colIdx)) {
      const raw = cell == null ? NaN : Number(String(cell).replace("%", "").trim());
      if (Number.isFinite(raw)) return `${raw.toFixed(2)}%`;
      return cell != null && typeof cell === "object" ? JSON.stringify(cell) : String(cell ?? "—");
    }
    if (!isMomColumn(colIdx)) {
      return cell != null && typeof cell === "object" ? JSON.stringify(cell) : String(cell ?? "—");
    }
    const raw = cell == null ? 0 : Number(String(cell).replace("%", "").trim());
    const pct = Number.isFinite(raw) ? raw : 0;
    const sign = pct > 0 ? "+" : pct < 0 ? "-" : "";
    const tone =
      pct > 0
        ? "text-emerald-700 bg-emerald-50 border-emerald-200"
        : pct < 0
          ? "text-red-700 bg-red-50 border-red-200"
          : "text-slate-700 bg-slate-100 border-slate-200";
    return (
      <span className={cn("inline-flex rounded-full border px-2 py-0.5 text-xs font-medium", tone)}>
        {sign}
        {Math.abs(pct).toFixed(2)}%
      </span>
    );
  };

  return (
    <div className="min-w-0 w-full overflow-x-hidden">
      <Table className="min-w-full w-full text-sm">
        <TableHeader className={emphasizedHeader ? "bg-muted/60" : undefined}>
          <TableRow>
            {visibleIndices.map((i) => (
              <TableHead
                key={i}
                className={cn(
                  headClass(i),
                  emphasizedHeader ? "text-sm font-semibold py-3 bg-muted/60" : undefined
                )}
              >
                {headers[i]}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {sortedRows
            .slice(page * pageSize, page * pageSize + pageSize)
            .map((row, i) => (
              <TableRow
                key={page * pageSize + i}
                className={onRowClick ? "cursor-pointer hover:bg-muted/60" : undefined}
                onClick={
                  onRowClick
                    ? () => {
                        const rowObject = cols.reduce<Record<string, unknown>>((acc, col, idx) => {
                          acc[col.name] = row[idx];
                          return acc;
                        }, {});
                        onRowClick(rowObject);
                      }
                    : undefined
                }
              >
                {visibleIndices.map((j) => (
                <TableCell
                  key={j}
                  className={cellClass(j)}
                >
                  {row[j] != null && typeof row[j] === "object"
                    ? JSON.stringify(row[j])
                    : renderCell(row[j], j)}
                  </TableCell>
                ))}
              </TableRow>
            ))}
        </TableBody>
      </Table>
      {pageCount > 1 && (
        <div className="mt-2 flex justify-start gap-1 overflow-x-auto">
          {Array.from({ length: pageCount }, (_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setPage(i)}
              className={cn(
                "h-7 min-w-7 rounded border px-2 text-xs",
                i === page
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card text-muted-foreground hover:bg-muted"
              )}
            >
              {i + 1}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Takes Metabase API JSON and returns data for the pie chart.
 * Never use account_id / id column as the value - use the actual metric (count per inbox).
 * Typical Metabase result: 3 cols = [account_id, inbox_name, count] or 2 cols = [inbox_name, count].
 */
function metabaseJsonToPieData(apiResponse: ApiResponse): { name: string; value: number; fill: string }[] {
  const { cols = [], rows = [] } = apiResponse;
  if (!rows.length) return [];

  const n = Math.max(cols.length, rows[0]?.length ?? 0);
  if (n === 0) return [];

  const labelLike = /inbox|channel|source|name|label|category|type|title/i;
  const numberLike = /count|total|value|number|tickets|sum|amount/i;
  const idLike = /^id$|account_id|account\s*id/i;

  let nameIdx = -1;
  let valueIdx = -1;

  for (let i = 0; i < cols.length; i++) {
    const disp = (cols[i]?.display_name || cols[i]?.name || "").toLowerCase();
    if (labelLike.test(disp) && !idLike.test(disp)) {
      nameIdx = i;
      break;
    }
  }
  for (let i = 0; i < cols.length; i++) {
    const disp = (cols[i]?.display_name || cols[i]?.name || "").toLowerCase();
    if ((numberLike.test(disp) || i === n - 1) && !idLike.test(disp) && i !== nameIdx) {
      valueIdx = i;
      break;
    }
  }

  if (n >= 3) {
    nameIdx = nameIdx >= 0 ? nameIdx : 1;
    valueIdx = valueIdx >= 0 ? valueIdx : n - 1;
    if (idLike.test((cols[valueIdx]?.display_name || cols[valueIdx]?.name || "").toLowerCase())) {
      valueIdx = n - 1;
    }
    if (nameIdx === valueIdx) {
      nameIdx = 1;
      valueIdx = 2;
    }
  } else if (n === 2) {
    if (nameIdx < 0) nameIdx = 0;
    if (valueIdx < 0) valueIdx = 1;
    if (nameIdx === valueIdx) {
      nameIdx = 0;
      valueIdx = 1;
    }
    if (idLike.test((cols[valueIdx]?.display_name || cols[valueIdx]?.name || "").toLowerCase())) {
      valueIdx = nameIdx === 0 ? 1 : 0;
    }
  } else {
    if (nameIdx < 0) nameIdx = 0;
    valueIdx = 0;
  }

  const parseVal = (raw: unknown): number => {
    if (typeof raw === "number" && !Number.isNaN(raw)) return raw;
    if (raw == null) return 0;
    const s = String(raw).replace(/,/g, "").replace(/\s/g, "");
    const num = Number(s);
    return Number.isNaN(num) ? 0 : num;
  };

  return rows
    .map((row, i) => ({
      name: row[nameIdx] != null ? String(row[nameIdx]) : `Item ${i + 1}`,
      value: parseVal(row[valueIdx]),
      fill: CHART_COLORS[i % CHART_COLORS.length],
    }))
    .filter((d) => d.value > 0);
}

function MetricPieChart({ cols, rows }: { cols: ApiResponse["cols"]; rows: ApiResponse["rows"] }) {
  const apiResponse: ApiResponse = { cols, rows };
  const data = metabaseJsonToPieData(apiResponse);
  const [activeIndex, setActiveIndex] = React.useState<number | null>(null);

  if (rows.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">No data for chart.</p>
    );
  }
  if (data.length === 0) {
    return (
      <div className="space-y-2">
        <p className="text-sm text-muted-foreground">No positive values to chart. Raw Metabase JSON (table):</p>
        <MetricTable cols={cols} rows={rows} />
      </div>
    );
  }

  const total = data.reduce((s, d) => s + d.value, 0);
  const active = activeIndex != null ? data[activeIndex] : null;
  const activePercent = active && total > 0 ? ((active.value / total) * 100).toFixed(1) : null;

  return (
    <div className="relative w-full min-w-0" style={{ height: 320 }}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
          <Tooltip
            formatter={(value: number) => [value.toLocaleString(), "Tickets"]}
            contentStyle={{
              borderRadius: "var(--radius)",
              border: "1px solid var(--border)",
            }}
          />
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            cx="50%"
            cy="50%"
            innerRadius="30%"
            outerRadius="72%"
            paddingAngle={0}
            activeIndex={activeIndex ?? undefined}
            activeShape={{ strokeWidth: 2, stroke: "var(--border)" }}
            onMouseEnter={(_, index) => setActiveIndex(index)}
            onMouseLeave={() => setActiveIndex(null)}
            onClick={(_, index) => setActiveIndex((prev) => (prev === index ? null : index))}
          >
            {data.map((entry, idx) => (
              <Cell key={`${entry.name}-${idx}`} fill={entry.fill} />
            ))}
          </Pie>
          <Legend
            layout="horizontal"
            align="center"
            verticalAlign="bottom"
            formatter={(value, entry: { payload?: { value?: unknown } }) => {
              const v = entry?.payload?.value;
              const num = typeof v === "number" ? v : Number(v);
              return (
                <span className="text-foreground text-sm">
                  {value}
                  {!Number.isNaN(num) && num >= 0 ? ` (${num.toLocaleString()})` : ""}
                </span>
              );
            }}
          />
        </PieChart>
      </ResponsiveContainer>
      {/* Center label on tap/hover */}
      <div
        className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none"
        style={{ marginBottom: 28 }}
      >
        {active != null ? (
          <>
            <span className="text-foreground text-sm font-medium text-center px-2 line-clamp-2">
              {active.name}
            </span>
            <span className="text-muted-foreground text-xs mt-0.5">
              {active.value.toLocaleString()}
              {activePercent != null ? ` (${activePercent}%)` : ""}
            </span>
          </>
        ) : (
          <span className="text-muted-foreground text-xs">Tap a slice for details</span>
        )}
      </div>
    </div>
  );
}

function MetricVoiceTiles({
  cols,
  rows,
}: {
  cols: ApiResponse["cols"];
  rows: ApiResponse["rows"];
}) {
  if (!rows.length) {
    return <p className="text-sm text-muted-foreground">No rows returned.</p>;
  }
  const normalize = (s: string) => s.toLowerCase().replace(/\s+/g, "_");
  const colIndex = (aliases: string[]) => {
    for (const alias of aliases) {
      const idx = cols.findIndex((c) => {
        const n = normalize(c.name || "");
        const d = normalize(c.display_name || "");
        const a = normalize(alias);
        return n === a || d === a;
      });
      if (idx >= 0) return idx;
    }
    return -1;
  };
  const channelIdx = colIndex(["call_channel", "channel", "call channel"]);
  const callsIdx = colIndex(["total_calls", "calls", "total calls"]);
  const minutesIdx = colIndex(["total_calling_minutes", "calling_minutes", "total minutes"]);
  const acceptanceIdx = colIndex(["acceptance_rate_pct", "acceptance_rate", "acceptance rate %"]);

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {rows.map((row, idx) => {
        const channel = channelIdx >= 0 ? String(row[channelIdx] ?? "—") : "—";
        const calls = callsIdx >= 0 ? String(row[callsIdx] ?? "—") : "—";
        const minutes = minutesIdx >= 0 ? String(row[minutesIdx] ?? "—") : "—";
        const acceptanceRaw = acceptanceIdx >= 0 ? String(row[acceptanceIdx] ?? "—") : "—";
        return (
          <React.Fragment key={idx}>
            <div className="rounded-xl border bg-card p-4">
              <p className="text-xs text-muted-foreground">Call Channel</p>
              <p className="mt-1 text-2xl font-semibold">{channel}</p>
            </div>
            <div className="rounded-xl border bg-card p-4">
              <p className="text-xs text-muted-foreground">Total Calls</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums">{calls}</p>
            </div>
            <div className="rounded-xl border bg-card p-4">
              <p className="text-xs text-muted-foreground">Total Calling Minutes</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums">{minutes}</p>
            </div>
            <div className="rounded-xl border bg-card p-4">
              <p className="text-xs text-muted-foreground">Acceptance Rate %</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums">{acceptanceRaw}</p>
            </div>
          </React.Fragment>
        );
      })}
    </div>
  );
}

export function MetricCard({ metric, filters, hideHeader, onTableRowClick }: MetricCardProps) {
  const [data, setData] = React.useState<ApiResponse | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [comparison, setComparison] = React.useState<{
    prevValue: number;
    delta: number;
    pct: number | null;
    days: number;
    period: "month" | "rolling";
  } | null>(null);

  const hasDateFilters = metric.hasDateFilters !== false;
  const optionalAccountId = metric.optionalAccountId === true;
  const requiresEndDateOnly = metric.requiresEndDateOnly === true;
  const hasFilters = optionalAccountId
    ? true
    : requiresEndDateOnly
      ? Boolean(filters.account_id && filters.end_date)
      : hasDateFilters
        ? Boolean(filters.account_id && filters.start_date && filters.end_date)
        : Boolean(filters.account_id);

  const effectiveDealOwner = metric.hasDealOwnerFilter ? filters.deal_owner : "";
  const effectiveEnterpriseMidmarket = metric.hasEnterpriseMidmarketFilter
    ? filters.enterprise_midmarket
    : "";
  const effectiveReplyText = metric.hasReplyTextFilter ? filters.reply_text : "";
  const effectiveMonth = metric.hasMonthFilter ? filters.month : "";

  const buildParams = React.useCallback(
    (start?: string, end?: string) => {
      const params = new URLSearchParams();
      if (filters.account_id) params.set("account_id", filters.account_id);
      if (hasDateFilters && start && end) {
        params.set("start_date", start);
        params.set("end_date", end);
      }
      if (requiresEndDateOnly && (end ?? filters.end_date)) {
        params.set("end_date", end ?? filters.end_date!);
      }
      if (metric.hasDealOwnerFilter && effectiveDealOwner) {
        params.set("deal_owner", effectiveDealOwner);
      }
      if (metric.hasEnterpriseMidmarketFilter && effectiveEnterpriseMidmarket) {
        params.set("enterprise_midmarket", effectiveEnterpriseMidmarket);
      }
      if (metric.hasReplyTextFilter && effectiveReplyText) {
        params.set("reply_text", effectiveReplyText);
      }
      if (metric.hasMonthFilter && effectiveMonth) {
        params.set("month", effectiveMonth);
      }
      params.set("_", String(Date.now()));
      return params;
    },
    [
      filters.account_id,
      filters.end_date,
      effectiveDealOwner,
      effectiveEnterpriseMidmarket,
      effectiveReplyText,
      effectiveMonth,
      hasDateFilters,
      requiresEndDateOnly,
      metric.hasDealOwnerFilter,
      metric.hasEnterpriseMidmarketFilter,
      metric.hasReplyTextFilter,
      metric.hasMonthFilter,
    ]
  );

  const fetchData = React.useCallback(async () => {
    if (!hasFilters) return;
    setLoading(true);
    setError(null);
    setData(null);
    try {
      const params = buildParams(filters.start_date, filters.end_date);
      const res = await fetch(
        `/api/metrics/${encodeURIComponent(metric.key)}?${params}`,
        { cache: "no-store", headers: { Pragma: "no-cache" } }
      );
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error((j as { error?: string }).error ?? `HTTP ${res.status}`);
      }
      const json = (await res.json()) as ApiResponse;
      setData({ cols: json.cols ?? [], rows: json.rows ?? [] });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [
    metric.key,
    hasFilters,
    filters.start_date,
    filters.end_date,
    buildParams,
  ]);

  const fetchComparison = React.useCallback(async () => {
    if (!hasFilters || metric.cardType !== "number") {
      setComparison(null);
      return;
    }

    const cmpPrev = metric.compareToPreviousMonth === true;
    const monthPrior =
      filters.start_date && filters.end_date
        ? getPriorFullMonthRange(filters.start_date, filters.end_date)
        : null;
    const useMonth = cmpPrev && monthPrior != null;

    if (!useMonth) {
      if (!hasDateFilters || !filters.start_date || !filters.end_date) {
        setComparison(null);
        return;
      }
    }

    const agentTime =
      metric.key === "agent_first_resolution_time" ||
      metric.key === "agent_resolution_time" ||
      metric.key === "agent_wait_time";

    const parseVal = (raw: unknown): number | null => {
      if (agentTime) return parseAgentDurationToSeconds(raw);
      const v =
        typeof raw === "number" ? raw : Number(String(raw ?? "").replace(/,/g, ""));
      return Number.isFinite(v) ? v : null;
    };

    const lastIdx = (rows: unknown[][]) => Math.max(0, (rows?.[0]?.length ?? 1) - 1);

    try {
      let currRes: Response;
      let prevRes: Response;
      let days = 0;
      const period: "month" | "rolling" = useMonth ? "month" : "rolling";

      if (useMonth && monthPrior) {
        if (requiresEndDateOnly) {
          [currRes, prevRes] = await Promise.all([
            fetch(
              `/api/metrics/${encodeURIComponent(metric.key)}?${buildParams(undefined, filters.end_date)}`,
              { cache: "no-store", headers: { Pragma: "no-cache" } }
            ),
            fetch(
              `/api/metrics/${encodeURIComponent(metric.key)}?${buildParams(undefined, monthPrior.end)}`,
              { cache: "no-store", headers: { Pragma: "no-cache" } }
            ),
          ]);
        } else {
          [currRes, prevRes] = await Promise.all([
            fetch(
              `/api/metrics/${encodeURIComponent(metric.key)}?${buildParams(filters.start_date, filters.end_date)}`,
              { cache: "no-store", headers: { Pragma: "no-cache" } }
            ),
            fetch(
              `/api/metrics/${encodeURIComponent(metric.key)}?${buildParams(monthPrior.start, monthPrior.end)}`,
              { cache: "no-store", headers: { Pragma: "no-cache" } }
            ),
          ]);
        }
      } else {
        const currStart = filters.start_date;
        const currEnd = filters.end_date;
        const start = new Date(currStart);
        const end = new Date(currEnd);
        if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) {
          setComparison(null);
          return;
        }

        const dayMs = 24 * 60 * 60 * 1000;
        days = Math.floor((end.getTime() - start.getTime()) / dayMs) + 1;
        const prevEnd = new Date(start.getTime() - dayMs);
        const prevStart = new Date(prevEnd.getTime() - (days - 1) * dayMs);
        const toYmd = (d: Date) => d.toISOString().slice(0, 10);

        [currRes, prevRes] = await Promise.all([
          fetch(
            `/api/metrics/${encodeURIComponent(metric.key)}?${buildParams(currStart, currEnd)}`,
            { cache: "no-store", headers: { Pragma: "no-cache" } }
          ),
          fetch(
            `/api/metrics/${encodeURIComponent(metric.key)}?${buildParams(toYmd(prevStart), toYmd(prevEnd))}`,
            { cache: "no-store", headers: { Pragma: "no-cache" } }
          ),
        ]);
      }

      if (!currRes.ok || !prevRes.ok) {
        setComparison(null);
        return;
      }
      const currJson = (await currRes.json()) as ApiResponse;
      const prevJson = (await prevRes.json()) as ApiResponse;
      const ci = lastIdx(currJson.rows ?? []);
      const pi = lastIdx(prevJson.rows ?? []);
      const currRaw = currJson.rows?.[0]?.[ci];
      const prevRaw = prevJson.rows?.[0]?.[pi];
      const currVal = parseVal(currRaw);
      const prevVal = parseVal(prevRaw);
      if (currVal == null || prevVal == null) {
        setComparison(null);
        return;
      }
      const delta = currVal - prevVal;
      const pct = prevVal === 0 ? (currVal === 0 ? 0 : null) : (delta / prevVal) * 100;
      setComparison({ prevValue: prevVal, delta, pct, days, period });
    } catch {
      setComparison(null);
    }
  }, [
    hasFilters,
    metric.cardType,
    metric.key,
    metric.compareToPreviousMonth,
    hasDateFilters,
    requiresEndDateOnly,
    filters.start_date,
    filters.end_date,
    buildParams,
  ]);

  React.useEffect(() => {
    if (hasFilters) fetchData();
    else setData(null);
  }, [hasFilters, fetchData]);

  React.useEffect(() => {
    fetchComparison();
  }, [fetchComparison]);

  const hint = optionalAccountId
    ? "Use filters above and click Apply."
    : hasDateFilters
      ? "Set account ID and date range, then click Apply."
      : "Set account ID, then click Apply.";

  return (
    <Card>
      {!hideHeader && (
        <CardHeader>
          <CardTitle className={metric.cardType === "number" ? "min-h-10 leading-5" : undefined}>
            {metric.label}
          </CardTitle>
        </CardHeader>
      )}
      <CardContent className={hideHeader ? "pt-4" : undefined}>
        {!hasFilters && (
          <p className="text-sm text-muted-foreground">{hint}</p>
        )}
        {hasFilters && loading && <Skeleton className="h-12 w-full" />}
        {hasFilters && error && (
          <p className="text-sm text-destructive">{error}</p>
        )}
        {hasFilters && !loading && !error && data && (
          <>
            {metric.cardType === "number" && (
              <>
                <MetricNumber
                  value={
                    (() => {
                      const row = data.rows?.[0];
                      const raw = !row?.length ? row?.[0] : row[row.length - 1];
                      if (
                        metric.key === "agent_first_resolution_time" ||
                        metric.key === "agent_resolution_time" ||
                        metric.key === "agent_wait_time"
                      ) {
                        return formatAgentDurationDisplay(String(raw ?? ""));
                      }
                      return raw;
                    })()
                  }
                  isCurrency={metric.isCurrency}
                />
                {comparison &&
                  (() => {
                    const agentTimeCmp =
                      metric.key === "agent_first_resolution_time" ||
                      metric.key === "agent_resolution_time" ||
                      metric.key === "agent_wait_time";
                    const lowerIsBetter = agentTimeCmp;
                    const d = comparison.delta;
                    const isGood =
                      d === 0 ? null : lowerIsBetter ? d < 0 : d > 0;
                    const tone =
                      isGood === null
                        ? "text-muted-foreground"
                        : isGood
                          ? "text-emerald-700"
                          : "text-red-700";
                    const head =
                      comparison.period === "month"
                        ? "vs previous month:"
                        : `vs previous ${comparison.days} days:`;
                    const pctStr =
                      comparison.pct == null
                        ? "N/A"
                        : `${comparison.pct > 0 ? "+" : comparison.pct < 0 ? "-" : ""}${Math.abs(comparison.pct).toFixed(1)}%`;
                    const paren = agentTimeCmp
                      ? formatDurationDeltaSeconds(comparison.delta)
                      : metric.isCurrency
                        ? `${comparison.delta > 0 ? "+" : comparison.delta < 0 ? "-" : ""}₹ ${Math.abs(comparison.delta).toLocaleString("en-IN")}`
                        : `${comparison.delta > 0 ? "+" : comparison.delta < 0 ? "-" : ""}${Math.abs(comparison.delta).toLocaleString("en-IN")}`;
                    return (
                      <p
                        className={cn(
                          "mt-2 min-h-8 whitespace-normal break-words leading-4 text-[11px] font-medium",
                          tone
                        )}
                      >
                        {head} {pctStr} ({paren})
                      </p>
                    );
                  })()}
                {!comparison &&
                  metric.cardType === "number" &&
                  (hasDateFilters ||
                    (metric.compareToPreviousMonth && requiresEndDateOnly)) && (
                    <p className="mt-2 min-h-8 text-[11px] opacity-0" aria-hidden="true">
                      placeholder
                    </p>
                  )}
              </>
            )}
            {metric.cardType === "table" && (
              metric.key === "revenue_voice" ? (
                <MetricVoiceTiles cols={data.cols} rows={data.rows} />
              ) : (
                <MetricTable
                  cols={data.cols}
                  rows={data.rows}
                  columnLabels={metric.columnLabels}
                  columnLabelMap={metric.columnLabelMap}
                  metricKey={metric.key}
                  onRowClick={onTableRowClick}
                  emphasizedHeader={metric.key === "acl_deal_owner_performance"}
                  hideDealOwnerColumn={metric.key === "deal_owner_account_type_distribution"}
                />
              )
            )}
            {metric.cardType === "summary" && (
              <MetricSummary cols={data.cols} rows={data.rows} month={filters.month} />
            )}
            {metric.cardType === "chart" && (
              <MetricPieChart cols={data.cols} rows={data.rows} />
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
