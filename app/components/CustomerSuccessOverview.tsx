"use client";

import * as React from "react";
import type { FilterValues } from "@/app/components/FilterBar";
import { FilterBar } from "@/app/components/FilterBar";
import { MetricCard, type MetricMeta } from "@/app/components/MetricCard";
import { Input } from "@/components/ui/input";
import { normalizeRecipients, validateSendInput } from "@/lib/report-send-validation";
import { cn } from "@/lib/utils";

const DEAL_OWNER_OPTIONS = [
  "Aswin Deepak",
  "Bhavya Gupta",
  "Drishti Lakshita",
  "Freeda Aranha",
  "Harshit Kumar",
  "Jhanvi S",
  "Mannan Raizada",
  "Richie Kenath",
  "Sridhar R",
  "Vipul Gambhir",
] as const;

const MONTH_OPTIONS = ["January", "February"] as const;
const REPLY_TEXT_PRESETS = [
  "find product",
  "track order",
  "manage order",
  "agent handoff",
  "show bot capabilities",
  "refund order",
  "image detected",
] as const;

interface CustomerSuccessOverviewProps {
  filters: FilterValues;
  onFiltersChange: (v: FilterValues) => void;
  onApplyFilters: (overrides?: Partial<FilterValues>) => void;
  formFilters: FilterValues;
  allMetrics: MetricMeta[];
  summaryMetric: MetricMeta | null;
  dealOwnerMetric: MetricMeta | null;
  aclMetric: MetricMeta | null;
  accountTypeDistributionMetric: MetricMeta | null;
}

export function CustomerSuccessOverview({
  filters,
  onFiltersChange,
  onApplyFilters,
  formFilters,
  allMetrics,
  summaryMetric,
  dealOwnerMetric,
  aclMetric,
  accountTypeDistributionMetric,
}: CustomerSuccessOverviewProps) {
  const [activeTab, setActiveTab] = React.useState<
    "customer_success_overview" | "metrics_overview"
  >("customer_success_overview");

  const [metricsForm, setMetricsForm] = React.useState<FilterValues>({
    account_id: formFilters.account_id ?? "",
    start_date: formFilters.start_date,
    end_date: formFilters.end_date,
    reply_text: "",
    deal_owner: "",
    enterprise_midmarket: "",
    month: formFilters.month ?? "",
  });
  const [metricsApplied, setMetricsApplied] = React.useState<FilterValues>({
    account_id: formFilters.account_id ?? "",
    start_date: formFilters.start_date,
    end_date: formFilters.end_date,
    reply_text: "",
    deal_owner: "",
    enterprise_midmarket: "",
    month: formFilters.month ?? "",
  });

  // Keep Metrics Overview dates in sync with the page defaults.
  React.useEffect(() => {
    setMetricsForm((p) => ({ ...p, start_date: formFilters.start_date, end_date: formFilters.end_date }));
    setMetricsApplied((p) => ({ ...p, start_date: formFilters.start_date, end_date: formFilters.end_date }));
  }, [formFilters.start_date, formFilters.end_date]);

  const byKey = React.useMemo(() => {
    const m = new Map<string, MetricMeta>();
    for (const mm of allMetrics) m.set(mm.key, mm);
    return m;
  }, [allMetrics]);

  const metric = (key: string) => byKey.get(key) ?? null;

  function useMetricScalar(key: string, f: FilterValues) {
    const [value, setValue] = React.useState<number | null>(null);
    const [loading, setLoading] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);
    React.useEffect(() => {
      if (!f.account_id || !f.start_date || !f.end_date) {
        setValue(null);
        setError(null);
        return;
      }
      let cancelled = false;
      setLoading(true);
      setError(null);
      const params = new URLSearchParams({
        account_id: f.account_id,
        start_date: f.start_date,
        end_date: f.end_date,
        _: String(Date.now()),
      });
      fetch(`/api/metrics/${encodeURIComponent(key)}?${params}`, { cache: "no-store" })
        .then(async (res) => {
          if (!res.ok) {
            const j = await res.json().catch(() => ({}));
            throw new Error((j as { error?: string }).error ?? `HTTP ${res.status}`);
          }
          return res.json();
        })
        .then((json: { rows?: unknown[][] }) => {
          if (cancelled) return;
          const row = json.rows?.[0];
          const raw = row?.[row.length - 1];
          const n = typeof raw === "number" ? raw : Number(String(raw ?? "").replace(/,/g, ""));
          setValue(Number.isFinite(n) ? n : null);
        })
        .catch((e) => {
          if (cancelled) return;
          setError(e instanceof Error ? e.message : "Failed to load");
          setValue(null);
        })
        .finally(() => {
          if (cancelled) return;
          setLoading(false);
        });
      return () => {
        cancelled = true;
      };
    }, [key, f.account_id, f.start_date, f.end_date]);
    return { value, loading, error };
  }

  const totalBotRevenue = useMetricScalar("revenue_total_bot", metricsApplied);
  const broadcast = useMetricScalar("revenue_broadcast", metricsApplied);
  const flow = useMetricScalar("revenue_flow", metricsApplied);
  const totalRevenue =
    (totalBotRevenue.value ?? 0) +
    (broadcast.value ?? 0) +
    (flow.value ?? 0);
  const [prevMonthRevenue, setPrevMonthRevenue] = React.useState<number | null>(null);
  const [prevMonthRevenueLoading, setPrevMonthRevenueLoading] = React.useState(false);
  const hasMetricsFilters =
    Boolean(metricsApplied.account_id?.trim()) &&
    Boolean(metricsApplied.start_date?.trim()) &&
    Boolean(metricsApplied.end_date?.trim());

  React.useEffect(() => {
    const shiftMonths = (ymd: string, months: number) => {
      const [y, m, d] = ymd.split("-").map(Number);
      if (!y || !m || !d) return "";
      const dt = new Date(Date.UTC(y, m - 1, d));
      dt.setUTCMonth(dt.getUTCMonth() + months);
      return dt.toISOString().slice(0, 10);
    };
    const fetchMetricValue = async (
      key: string,
      accountId: string,
      startDate: string,
      endDate: string
    ) => {
      const params = new URLSearchParams({
        account_id: accountId,
        start_date: startDate,
        end_date: endDate,
        _: String(Date.now()),
      });
      const res = await fetch(`/api/metrics/${encodeURIComponent(key)}?${params}`, {
        cache: "no-store",
      });
      if (!res.ok) return 0;
      const json = (await res.json()) as { rows?: unknown[][] };
      const row = json.rows?.[0] ?? [];
      const raw = row[row.length - 1];
      const n = typeof raw === "number" ? raw : Number(String(raw ?? "").replace(/,/g, ""));
      return Number.isFinite(n) ? n : 0;
    };

    if (!hasMetricsFilters) {
      setPrevMonthRevenue(null);
      return;
    }
    const prevStart = shiftMonths(metricsApplied.start_date, -1);
    const prevEnd = shiftMonths(metricsApplied.end_date, -1);
    if (!prevStart || !prevEnd) {
      setPrevMonthRevenue(null);
      return;
    }
    let cancelled = false;
    setPrevMonthRevenueLoading(true);
    Promise.all([
      fetchMetricValue("revenue_total_bot", metricsApplied.account_id, prevStart, prevEnd),
      fetchMetricValue("revenue_broadcast", metricsApplied.account_id, prevStart, prevEnd),
      fetchMetricValue("revenue_flow", metricsApplied.account_id, prevStart, prevEnd),
    ])
      .then(([bot, bc, fl]) => {
        if (cancelled) return;
        setPrevMonthRevenue(bot + bc + fl);
      })
      .catch(() => {
        if (cancelled) return;
        setPrevMonthRevenue(null);
      })
      .finally(() => {
        if (cancelled) return;
        setPrevMonthRevenueLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [hasMetricsFilters, metricsApplied.account_id, metricsApplied.start_date, metricsApplied.end_date]);

  const [widgetInfo, setWidgetInfo] = React.useState<{
    widgetPresentByLc: string | null;
    widgetType: string | null;
  } | null>(null);
  const [widgetLoading, setWidgetLoading] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (activeTab !== "metrics_overview") return;
      const lc = metricsApplied.account_id?.trim();
      if (!lc) {
        setWidgetInfo(null);
        setWidgetLoading(false);
        return;
      }
      setWidgetLoading(true);
      try {
        const params = new URLSearchParams({ account_id: lc, _: String(Date.now()) });
        const res = await fetch(`/api/metrics/web_widget_type?${params.toString()}`, { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as {
          cols?: Array<{ name?: string; display_name?: string }>;
          rows?: unknown[][];
          error?: string;
        };
        if (cancelled) return;
        if (json.error) throw new Error(json.error);
        const cols = json.cols ?? [];
        const row = json.rows?.[0] ?? [];
        const normalize = (s: string) => s.toLowerCase().replace(/\s+/g, "_");
        const widgetTypeIdx = cols.findIndex((c) => {
          const n = normalize(String(c?.name ?? ""));
          const d = normalize(String(c?.display_name ?? ""));
          return n.includes("widget_type") || d.includes("widget_type") || n.includes("widget") || d.includes("widget");
        });
        const raw =
          widgetTypeIdx >= 0
            ? row[widgetTypeIdx]
            : row.find((v) => String(v ?? "").trim() !== "");
        let widgetType = String(raw ?? "").trim();

        // Fallback: if card 3201 returns blank, read from widget sheet API.
        if (!widgetType) {
          const fallbackRes = await fetch(`/api/widget?${params.toString()}`, { cache: "no-store" });
          if (fallbackRes.ok) {
            const fallbackJson = (await fallbackRes.json()) as {
              widgetType?: string | null;
              widgetPresentByLc?: string | null;
            };
            widgetType = String(fallbackJson.widgetType ?? "").trim();
          }
        }
        setWidgetInfo({
          widgetPresentByLc: widgetType ? "Yes" : "No widget",
          widgetType: widgetType || "No widget",
        });
      } catch {
        if (cancelled) return;
        setWidgetInfo(null);
      } finally {
        if (cancelled) return;
        setWidgetLoading(false);
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [activeTab, metricsApplied.account_id]);

  const [mrrFebForRoi, setMrrFebForRoi] = React.useState<number | null>(null);
  const [roiLoading, setRoiLoading] = React.useState(false);
  const [roiError, setRoiError] = React.useState<string | null>(null);
  const [selectedDealOwner, setSelectedDealOwner] = React.useState<string | null>(null);
  const [selectedAccount, setSelectedAccount] = React.useState<Record<string, unknown> | null>(null);
  const [spotlightMetrics, setSpotlightMetrics] = React.useState<{
    janMrr: number;
    febMrr: number;
    febPlatformFee: number;
    janPlatformFee: number;
    febBot: number;
    janBot: number;
    febAgent: number;
    janAgent: number;
    febOutbound: number;
    janOutbound: number;
    febVoice: number;
    janVoice: number;
  } | null>(null);
  const [spotlightLoading, setSpotlightLoading] = React.useState(false);
  const [reportEmail, setReportEmail] = React.useState("");
  const [reportBusy, setReportBusy] = React.useState(false);
  const [reportStatus, setReportStatus] = React.useState<string | null>(null);
  const [reportSubject, setReportSubject] = React.useState("");
  const [reportBody, setReportBody] = React.useState("");
  const [reportStep, setReportStep] = React.useState<string | null>(null);
  const [showReportPreview, setShowReportPreview] = React.useState(false);
  const [reportValidationError, setReportValidationError] = React.useState<string | null>(null);
  const [forceResend, setForceResend] = React.useState(false);
  const [roiRevenueInput, setRoiRevenueInput] = React.useState("");
  const [roiMrrInput, setRoiMrrInput] = React.useState("");
  const [customRoi, setCustomRoi] = React.useState<number | null>(null);
  const [roiInputError, setRoiInputError] = React.useState<string | null>(null);
  const dashboardPrintRef = React.useRef<HTMLDivElement | null>(null);
  React.useEffect(() => {
    setSelectedAccount(null);
  }, [selectedDealOwner]);

  const toNum = (v: unknown) => {
    const n = Number(String(v ?? "").replace(/,/g, "").replace("%", "").trim());
    return Number.isFinite(n) ? n : 0;
  };
  const getField = (row: Record<string, unknown> | null, keys: string[]) => {
    if (!row) return undefined;
    for (const k of keys) {
      if (row[k] != null) return row[k];
    }
    return undefined;
  };
  const formatInr = (v: number) => `₹ ${v.toLocaleString("en-IN")}`;
  const normalize = (s: string) => s.toLowerCase().replace(/\s+/g, "_");
  const readField = (
    cols: Array<{ name: string; display_name: string }>,
    row: unknown[] | undefined,
    keys: string[]
  ) => {
    if (!row?.length) return 0;
    // Respect key priority order: try each key in sequence and return first match.
    for (const key of keys.map((k) => normalize(k))) {
      const exactIdx = cols.findIndex((c) => {
        const n = normalize(c.name || "");
        const d = normalize(c.display_name || "");
        return n === key || d === key;
      });
      if (exactIdx >= 0) return toNum(row[exactIdx]);
      const containsIdx = cols.findIndex((c) => {
        const n = normalize(c.name || "");
        const d = normalize(c.display_name || "");
        return n.includes(key) || d.includes(key);
      });
      if (containsIdx >= 0) return toNum(row[containsIdx]);
    }
    return 0;
  };

  React.useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (activeTab !== "metrics_overview") return;
      const lc = metricsApplied.account_id?.trim();
      if (!lc) {
        setMrrFebForRoi(null);
        setRoiError(null);
        setRoiLoading(false);
        return;
      }
      setRoiLoading(true);
      setRoiError(null);
      try {
        // Fetch with month=February so the response includes both `mrr_jan` and `mrr_feb`.
        const params = new URLSearchParams({
          account_id: lc,
          deal_owner: metricsApplied.deal_owner ?? "",
          enterprise_midmarket: metricsApplied.enterprise_midmarket ?? "",
          month: "February",
          _: String(Date.now()),
        });
        const res = await fetch(`/api/metrics/customer_success_summary?${params.toString()}`, {
          cache: "no-store",
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as {
          cols?: Array<{ name: string; display_name: string }>;
          rows?: unknown[][];
          error?: string;
        };
        if (json.error) throw new Error(json.error);
        const cols = json.cols ?? [];
        const row = json.rows?.[0];
        const mrrJan = readField(cols, row, ["mrr_jan", "MRR Jan", "mrr"]);
        const mrrFeb = readField(cols, row, ["mrr_feb", "MRR Feb", "mrr"]);

        const parseMonth = (d: string) => {
          const dt = new Date(d);
          return Number.isNaN(dt.getTime()) ? null : dt.getMonth(); // 0=Jan
        };
        const startMonth = parseMonth(metricsApplied.start_date ?? "");
        const endMonth = parseMonth(metricsApplied.end_date ?? "");
        const denomIsJan = startMonth === 0 && endMonth === 0;
        const denom = denomIsJan ? mrrJan : mrrFeb;
        if (cancelled) return;
        setMrrFebForRoi(denom);
      } catch (e) {
        if (cancelled) return;
        setMrrFebForRoi(null);
        setRoiError(e instanceof Error ? e.message : "ROI lookup failed");
      } finally {
        if (cancelled) return;
        setRoiLoading(false);
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [
    activeTab,
    metricsApplied.account_id,
    metricsApplied.deal_owner,
    metricsApplied.enterprise_midmarket,
    metricsApplied.start_date,
    metricsApplied.end_date,
  ]);
  const accountName = String(getField(selectedAccount, ["account_name", "Account Name"]) ?? "");
  const accountId = String(getField(selectedAccount, ["account_id", "LC Account ID"]) ?? "");
  const mrrFeb = spotlightMetrics?.febMrr ?? toNum(getField(selectedAccount, ["mrr_feb", "MRR Feb", "mrr"]));
  const mrrJan = spotlightMetrics?.janMrr ?? toNum(getField(selectedAccount, ["mrr_jan", "MRR Jan"]));
  const mrrTrend =
    mrrJan === 0
      ? (mrrFeb === 0 ? 0 : 100)
      : ((mrrFeb - mrrJan) / mrrJan) * 100;
  const enterpriseMidmarket =
    String(
      getField(selectedAccount, ["enterprise_midmarket", "Enterprise / Mid market"]) ??
      (mrrFeb >= 100000 ? "Enterprise" : "Mid Market")
    );
  const pf = spotlightMetrics?.febPlatformFee ?? toNum(getField(selectedAccount, ["contract_revenue_platform_fee_feb", "platform_fee_feb", "platform_fee"]));
  const bot = spotlightMetrics?.febBot ?? toNum(getField(selectedAccount, ["contract_revenue_bot_feb", "bot_revenue_feb", "bot_revenue"]));
  const agent = spotlightMetrics?.febAgent ?? toNum(getField(selectedAccount, ["contract_revenue_agent_feb", "agent_revenue_feb", "agent_revenue"]));
  const outb = spotlightMetrics?.febOutbound ?? toNum(getField(selectedAccount, ["contract_revenue_outbound_feb", "outbound_revenue_feb", "outbound_revenue"]));
  const voice = spotlightMetrics?.febVoice ?? toNum(getField(selectedAccount, ["contract_revenue_voice_feb", "voice_revenue_feb", "voice_revenue"]));
  const dPf = pf - (spotlightMetrics?.janPlatformFee ?? 0);
  const dBot = bot - (spotlightMetrics?.janBot ?? 0);
  const dAgent = agent - (spotlightMetrics?.janAgent ?? 0);
  const dOutb = outb - (spotlightMetrics?.janOutbound ?? 0);
  const dVoice = voice - (spotlightMetrics?.janVoice ?? 0);
  const janPf = spotlightMetrics?.janPlatformFee ?? 0;
  const janBot = spotlightMetrics?.janBot ?? 0;
  const janAgent = spotlightMetrics?.janAgent ?? 0;
  const janOutb = spotlightMetrics?.janOutbound ?? 0;
  const janVoice = spotlightMetrics?.janVoice ?? 0;
  const trendFor = (current: number, jan: number) => {
    const delta = current - jan;
    const pct = jan === 0 ? (current === 0 ? 0 : 100) : (delta / jan) * 100;
    const sign = delta > 0 ? "+" : delta < 0 ? "-" : "";
    return { delta, pct, sign };
  };
  const computedDriver = (() => {
    const entries = [
      { label: "Platform Fee", delta: dPf },
      { label: "Bot", delta: dBot },
      { label: "Agent", delta: dAgent },
      { label: "Outbound", delta: dOutb },
      { label: "Voice", delta: dVoice },
    ];
    const mrrDelta = mrrFeb - mrrJan;
    if (mrrDelta > 0) {
      const topPositive = [...entries]
        .filter((e) => e.delta > 0)
        .sort((a, b) => b.delta - a.delta)[0];
      return topPositive ? topPositive.label : "Stable";
    }
    if (mrrDelta < 0) {
      const topNegative = [...entries]
        .filter((e) => e.delta < 0)
        .sort((a, b) => a.delta - b.delta)[0];
      return topNegative ? topNegative.label : "Stable";
    }
    const top = [...entries].sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))[0];
    return top && Math.abs(top.delta) > 0 ? top.label : "Stable";
  })();
  const computedReason = [
    dPf !== 0 ? `Platform Fee ${dPf > 0 ? "▲" : "▼"} ${Math.abs(dPf).toLocaleString("en-IN")}` : "",
    dBot !== 0 ? `Bot ${dBot > 0 ? "▲" : "▼"} ${Math.abs(dBot).toLocaleString("en-IN")}` : "",
    dAgent !== 0 ? `Agent ${dAgent > 0 ? "▲" : "▼"} ${Math.abs(dAgent).toLocaleString("en-IN")}` : "",
    dOutb !== 0 ? `Outbound ${dOutb > 0 ? "▲" : "▼"} ${Math.abs(dOutb).toLocaleString("en-IN")}` : "",
    dVoice !== 0 ? `Voice ${dVoice > 0 ? "▲" : "▼"} ${Math.abs(dVoice).toLocaleString("en-IN")}` : "",
  ]
    .filter(Boolean)
    .join(" | ");
  const driver = computedDriver || String(getField(selectedAccount, ["primary_change_driver", "Primary Change Driver"]) ?? "—");
  const reason = computedReason || String(getField(selectedAccount, ["change_reason", "Change Reason"]) ?? "—");

  React.useEffect(() => {
    if (!accountId) {
      setSpotlightMetrics(null);
      return;
    }
    let cancelled = false;
    setSpotlightLoading(true);
    const run = async () => {
      // Keep popup values aligned with main dashboard filtering behavior.
      // Use currently applied page filters and only override account + month.
      const baseParams = new URLSearchParams();
      baseParams.set("account_id", accountId);
      if (filters.deal_owner) baseParams.set("deal_owner", filters.deal_owner);
      if (filters.enterprise_midmarket) {
        baseParams.set("enterprise_midmarket", filters.enterprise_midmarket);
      }
      const janParams = new URLSearchParams(baseParams);
      janParams.set("month", "January");
      const febParams = new URLSearchParams(baseParams);
      febParams.set("month", "February");
      const [janRes, febRes] = await Promise.all([
        fetch(`/api/metrics/customer_success_summary?${janParams}`, { cache: "no-store" }),
        fetch(`/api/metrics/customer_success_summary?${febParams}`, { cache: "no-store" }),
      ]);
      if (!janRes.ok || !febRes.ok) return;
      const janJson = (await janRes.json()) as { cols?: Array<{ name: string; display_name: string }>; rows?: unknown[][] };
      const febJson = (await febRes.json()) as { cols?: Array<{ name: string; display_name: string }>; rows?: unknown[][] };
      const janCols = janJson.cols ?? [];
      const janRow = janJson.rows?.[0];
      const febCols = febJson.cols ?? [];
      const febRow = febJson.rows?.[0];
      if (cancelled) return;
      const janPlatformFee = readField(janCols, janRow, ["contract_revenue_platform_fee_jan", "platform_fee_jan", "platform_fee"]);
      const janBot = readField(janCols, janRow, ["contract_revenue_bot_jan", "bot_revenue_jan", "bot_revenue"]);
      const janAgent = readField(janCols, janRow, ["contract_revenue_agent_jan", "agent_revenue_jan", "agent_revenue"]);
      const janOutbound = readField(janCols, janRow, ["contract_revenue_outbound_jan", "outbound_revenue_jan", "outbound"]);
      const janVoice = readField(janCols, janRow, ["contract_revenue_voice_jan", "voice_revenue_jan", "voice"]);
      const janComponentSum = janPlatformFee + janBot + janAgent + janOutbound + janVoice;
      const janMrrValue = janComponentSum !== 0
        ? janComponentSum
        : readField(janCols, janRow, ["mrr_jan", "enterprise_revenue_jan", "mid_market_revenue_jan"]);
      const febPlatformFee = readField(febCols, febRow, ["contract_revenue_platform_fee_feb", "platform_fee_feb", "platform_fee"]);
      const febBot = readField(febCols, febRow, ["contract_revenue_bot_feb", "bot_revenue_feb", "bot_revenue"]);
      const febAgent = readField(febCols, febRow, ["contract_revenue_agent_feb", "agent_revenue_feb", "agent_revenue"]);
      const febOutbound = readField(febCols, febRow, ["contract_revenue_outbound_feb", "outbound_revenue_feb", "outbound"]);
      const febVoice = readField(febCols, febRow, ["contract_revenue_voice_feb", "voice_revenue_feb", "voice"]);
      const febComponentSum = febPlatformFee + febBot + febAgent + febOutbound + febVoice;
      const febMrrValue = febComponentSum !== 0
        ? febComponentSum
        : readField(febCols, febRow, ["mrr_feb", "enterprise_revenue_feb", "mid_market_revenue_feb"]);
      setSpotlightMetrics({
        janMrr: janMrrValue,
        febMrr: febMrrValue,
        febPlatformFee,
        janPlatformFee,
        febBot,
        janBot,
        febAgent,
        janAgent,
        febOutbound,
        janOutbound,
        febVoice,
        janVoice,
      });
    };
    run()
      .catch(() => {
        if (!cancelled) setSpotlightMetrics(null);
      })
      .finally(() => {
        if (!cancelled) setSpotlightLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [accountId, filters.deal_owner, filters.enterprise_midmarket]);

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background">
      <aside className="sticky top-0 h-screen w-56 shrink-0 border-r border-[var(--sidebar-border)] bg-[var(--sidebar)] text-[var(--sidebar-foreground)]">
        <div className="flex min-h-full flex-col gap-1 p-4">
          <div className="mb-6 flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white">
              <img
                src="/limechat-leaf.png"
                alt="LimeChat"
                className="h-7 w-7 object-contain"
              />
            </div>
            <span className="text-base font-semibold tracking-tight text-white">
              LimeChat
            </span>
          </div>
          <button
            type="button"
            onClick={() => setActiveTab("customer_success_overview")}
            className={cn(
              "w-full rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors",
              activeTab === "customer_success_overview"
                ? "bg-white text-[var(--sidebar)]"
                : "text-white/90 hover:bg-white/20 hover:text-white"
            )}
          >
            Customer Success Overview
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("metrics_overview")}
            className={cn(
              "mt-2 w-full rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors",
              activeTab === "metrics_overview"
                ? "bg-white text-[var(--sidebar)]"
                : "text-white/90 hover:bg-white/20 hover:text-white"
            )}
          >
            Metrics Overview
          </button>
          <div className="mt-auto pt-8 text-xs text-white/80">
            CS Platform v2.1
          </div>
        </div>
      </aside>

      <main className="h-screen flex-1 overflow-y-auto">
        <div className="space-y-6 p-6 md:p-7">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <h1 className="text-xl font-bold text-foreground">
              {activeTab === "customer_success_overview"
                ? "Customer Success Overview : February 2026"
                : activeTab === "metrics_overview"
                  ? "Metrics Overview"
                  : "Metrics Overview"}
            </h1>
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex size-9 items-center justify-center rounded-full bg-muted text-sm font-medium text-muted-foreground">
                RS
              </div>
            </div>
          </div>

          {activeTab === "customer_success_overview" ? (
            <>
              <div className="flex flex-wrap items-end gap-3 rounded-lg border bg-card p-3">
                <div className="grid gap-1">
                  <label className="text-xs font-medium text-muted-foreground">
                    Account ID
                  </label>
                  <Input
                    placeholder="Account ID"
                    value={formFilters.account_id}
                    onChange={(e) =>
                      onFiltersChange({ ...formFilters, account_id: e.target.value.trim() })
                    }
                    className="h-9 w-40"
                  />
                </div>
                <div className="grid gap-1">
                  <label className="text-xs font-medium text-muted-foreground">
                    Deal Owner
                  </label>
                  <select
                    className="h-9 w-44 rounded-full border border-input bg-transparent px-3 text-sm"
                    value={formFilters.deal_owner || ""}
                    onChange={(e) => onApplyFilters({ deal_owner: e.target.value })}
                  >
                    <option value="">All</option>
                    {DEAL_OWNER_OPTIONS.map((name) => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="grid gap-1">
                  <label className="text-xs font-medium text-muted-foreground">
                    Enterprise / Mid Market
                  </label>
                  <select
                    className="h-9 w-36 rounded-full border border-input bg-transparent px-3 text-sm"
                    value={formFilters.enterprise_midmarket || "all"}
                    onChange={(e) =>
                      onFiltersChange({
                        ...formFilters,
                        enterprise_midmarket: e.target.value === "all" ? "" : e.target.value,
                      })
                    }
                  >
                    <option value="all">All</option>
                    <option value="Enterprise">Enterprise</option>
                    <option value="Mid Market">Mid Market</option>
                  </select>
                </div>
                <div className="grid gap-1">
                  <label className="text-xs font-medium text-muted-foreground">
                    Month
                  </label>
                  <select
                    className="h-9 w-32 rounded-full border border-input bg-transparent px-3 text-sm"
                    value={formFilters.month || "February"}
                    onChange={(e) =>
                      onFiltersChange({
                        ...formFilters,
                        month: e.target.value,
                      })
                    }
                  >
                    {MONTH_OPTIONS.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                </div>
                <button
                  type="button"
                  onClick={() => onApplyFilters()}
                  className="h-9 rounded-full bg-primary px-5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
                >
                  Apply
                </button>
              </div>

              {summaryMetric && (
                <section>
                  <MetricCard
                    metric={summaryMetric}
                    filters={filters}
                    hideHeader
                  />
                </section>
              )}

              <section>
                <div className="mb-3 flex items-center justify-between gap-2">
                  <h2 className="text-lg font-semibold tracking-tight text-foreground">
                    Deal Owner Performance
                  </h2>
                  <span
                    title="Click a deal owner row to view details"
                    aria-label="Click a deal owner row to view details"
                    className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-emerald-200 bg-emerald-50 text-xs font-semibold text-emerald-700"
                  >
                    i
                  </span>
                </div>
                {dealOwnerMetric && (
                  <MetricCard
                    metric={dealOwnerMetric}
                    filters={filters}
                    hideHeader
                    onTableRowClick={(row) => {
                      const owner =
                        row.deal_owner ??
                        row["Deal Owner"] ??
                        row.dealOwner;
                      if (owner != null && String(owner).trim() !== "") {
                        setSelectedDealOwner(String(owner));
                      }
                    }}
                  />
                )}
              </section>

            </>
          ) : (
            <>
              <div className="mb-4">
                <FilterBar
                  values={metricsForm}
                  onChange={setMetricsForm}
                  onApply={() => setMetricsApplied(metricsForm)}
                  restrictToMonthPresets
                />
                <div className="mt-3 flex flex-wrap items-end gap-2 rounded-lg border bg-card p-3">
                  <button
                    type="button"
                    disabled={!hasMetricsFilters || reportBusy}
                    onClick={async () => {
                      if (!hasMetricsFilters) return;
                      setReportBusy(true);
                      setReportStatus(null);
                      try {
                        const source = dashboardPrintRef.current;
                        if (!source) throw new Error("Dashboard view not ready for PDF.");
                        const printable = source.cloneNode(true) as HTMLDivElement;
                        printable
                          .querySelectorAll('[data-pdf-exclude="true"]')
                          .forEach((node) => node.remove());
                        const sourceWidth =
                          source.scrollWidth || source.getBoundingClientRect().width || 1;
                        const targetWidthPx = 730;
                        const scale = Math.min(1, targetWidthPx / sourceWidth);
                        const styles = Array.from(
                          document.querySelectorAll('style, link[rel="stylesheet"]')
                        )
                          .map((el) => el.outerHTML)
                          .join("\n");
                        const html = `<!doctype html><html><head><meta charset="utf-8" />
                        <meta name="viewport" content="width=device-width, initial-scale=1" />
                        <title>Metrics Dashboard PDF</title>${styles}
                        <style>
                          @page { size: A4 portrait; margin: 8mm; }
                          html, body { margin: 0; padding: 0; background: #fff; }
                          .print-wrap { width: 194mm; overflow: visible; }
                          .print-scale {
                            width: ${sourceWidth}px;
                            zoom: ${scale};
                          }
                          @media print {
                            .print-wrap { width: 194mm; }
                            .print-scale {
                              zoom: ${scale};
                              break-inside: auto;
                              page-break-inside: auto;
                            }
                            .print-scale [data-pdf-page-break-before="true"] {
                              break-before: page;
                              page-break-before: always;
                            }
                            .print-scale * {
                              break-inside: auto;
                              page-break-inside: auto;
                            }
                          }
                        </style>
                        </head><body><div class="print-wrap"><div class="print-scale">${printable.outerHTML}</div></div></body></html>`;
                        const printWindow = window.open("", "_blank");
                        if (!printWindow) throw new Error("Popup blocked. Please allow popups and retry.");
                        printWindow.document.open();
                        printWindow.document.write(html);
                        printWindow.document.close();
                        printWindow.onload = () => {
                          printWindow.focus();
                          printWindow.print();
                        };
                        setReportStatus("PDF opened in print dialog.");
                      } catch (e) {
                        setReportStatus(e instanceof Error ? e.message : "Failed to generate report");
                      } finally {
                        setReportBusy(false);
                      }
                    }}
                    className="h-9 rounded-full border border-input bg-background px-4 text-sm font-medium hover:bg-muted disabled:opacity-60"
                  >
                    Download PDF Report
                  </button>
                  <Input
                    placeholder="Recipients (comma-separated, up to 5)"
                    value={reportEmail}
                    onChange={(e) => setReportEmail(e.target.value)}
                    className="h-9 w-72 rounded-full"
                  />
                  <button
                    type="button"
                    disabled={!hasMetricsFilters || !reportEmail.trim() || reportBusy}
                    onClick={async () => {
                      const recipients = normalizeRecipients(
                        reportEmail
                          .split(",")
                          .map((v) => v.trim())
                          .filter(Boolean)
                      );
                      const validationError = validateSendInput({
                        accountId: metricsApplied.account_id ?? "",
                        startDate: metricsApplied.start_date ?? "",
                        endDate: metricsApplied.end_date ?? "",
                        recipients,
                        subject: "preview",
                        body: "preview",
                      });
                      if (validationError) {
                        setReportValidationError(validationError);
                        setReportStep("Failed");
                        return;
                      }
                      setReportValidationError(null);
                      setReportBusy(true);
                      setReportStatus(null);
                      try {
                        setReportStep("Generating");
                        const params = new URLSearchParams({
                          account_id: metricsApplied.account_id,
                          start_date: metricsApplied.start_date,
                          end_date: metricsApplied.end_date,
                          deal_owner: metricsApplied.deal_owner ?? "",
                          enterprise_midmarket: metricsApplied.enterprise_midmarket ?? "",
                          reply_text: metricsApplied.reply_text ?? "",
                          month: metricsApplied.month ?? "",
                          _: String(Date.now()),
                        });
                        const res = await fetch(`/api/report/compose?${params.toString()}`, {
                          cache: "no-store",
                        });
                        const raw = await res.text();
                        let json: { subject?: string; body?: string; error?: string } = {};
                        try {
                          json = raw ? (JSON.parse(raw) as typeof json) : {};
                        } catch {
                          throw new Error(`Compose API returned non-JSON response (HTTP ${res.status}).`);
                        }
                        if (!res.ok || json.error) {
                          throw new Error(json.error ?? `HTTP ${res.status}`);
                        }
                        setReportSubject(json.subject ?? "");
                        setReportBody(json.body ?? "");
                        setShowReportPreview(true);
                        setReportStep(null);
                      } catch (e) {
                        setReportStatus(e instanceof Error ? e.message : "Failed to email report");
                        setReportStep("Failed");
                      } finally {
                        setReportBusy(false);
                      }
                    }}
                    className="h-9 rounded-full bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
                  >
                    Preview & Email Report
                  </button>
                  {reportStep && <p className="text-xs text-muted-foreground">Status: {reportStep}</p>}
                  {reportValidationError && (
                    <p className="text-xs text-destructive">{reportValidationError}</p>
                  )}
                  {reportStatus && <p className="text-xs text-muted-foreground">{reportStatus}</p>}
                </div>
                {showReportPreview && (
                  <div className="mt-3 rounded-xl border bg-card p-4">
                    <p className="text-sm font-semibold text-foreground">Pre-send Preview</p>
                    <div className="mt-3 grid gap-1">
                      <label className="text-xs font-medium text-muted-foreground">Subject</label>
                      <Input
                        value={reportSubject}
                        onChange={(e) => setReportSubject(e.target.value)}
                        className="h-9 rounded-full"
                      />
                    </div>
                    <div className="mt-3 grid gap-1">
                      <label className="text-xs font-medium text-muted-foreground">Body</label>
                      <textarea
                        value={reportBody}
                        onChange={(e) => setReportBody(e.target.value)}
                        className="min-h-40 rounded-xl border border-input bg-background px-3 py-2 text-sm"
                      />
                    </div>
                    <label className="mt-3 inline-flex items-center gap-2 text-xs text-muted-foreground">
                      <input
                        type="checkbox"
                        checked={forceResend}
                        onChange={(e) => setForceResend(e.target.checked)}
                      />
                      Force resend (bypass duplicate-send protection)
                    </label>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        disabled={reportBusy || !reportSubject.trim() || !reportBody.trim()}
                        onClick={async () => {
                          const recipients = normalizeRecipients(
                            reportEmail
                              .split(",")
                              .map((v) => v.trim())
                              .filter(Boolean)
                          );
                          const validationError = validateSendInput({
                            accountId: metricsApplied.account_id ?? "",
                            startDate: metricsApplied.start_date ?? "",
                            endDate: metricsApplied.end_date ?? "",
                            recipients,
                            subject: reportSubject,
                            body: reportBody,
                          });
                          if (validationError) {
                            setReportValidationError(validationError);
                            setReportStep("Failed");
                            return;
                          }
                          setReportValidationError(null);
                          setReportBusy(true);
                          setReportStatus(null);
                          try {
                            setReportStep("Sending");
                            const res = await fetch("/api/report/email", {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({
                                to: reportEmail.trim(),
                                filters: metricsApplied,
                                subject: reportSubject,
                                body: reportBody,
                                forceResend,
                              }),
                            });
                            const raw = await res.text();
                            let json: {
                              error?: string;
                              providerError?: string;
                              runId?: string;
                            } = {};
                            try {
                              json = raw ? (JSON.parse(raw) as typeof json) : {};
                            } catch {
                              throw new Error(
                                `Email API returned non-JSON response (HTTP ${res.status}).`
                              );
                            }
                            if (!res.ok || json.error) {
                              const lead = json.error ?? `HTTP ${res.status}`;
                              const tail = [json.providerError?.trim(), json.runId ? `ref: ${json.runId}` : ""]
                                .filter(Boolean)
                                .join(" — ");
                              throw new Error(tail ? `${lead} (${tail})` : lead);
                            }
                            setReportStep("Sent");
                            setReportStatus("Report emailed successfully.");
                            setShowReportPreview(false);
                          } catch (e) {
                            setReportStep("Failed");
                            setReportStatus(e instanceof Error ? e.message : "Failed to email report");
                          } finally {
                            setReportBusy(false);
                          }
                        }}
                        className="h-9 rounded-full bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
                      >
                        Confirm Send
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowReportPreview(false)}
                        className="h-9 rounded-full border border-input bg-background px-4 text-sm font-medium hover:bg-muted"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>

              <div ref={dashboardPrintRef} className="space-y-4">
                <div className="grid gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
                  {/* Widget */}
                  <div>
                    <h3 className="text-sm font-semibold tracking-tight text-foreground">Widget</h3>
                    <div className="mt-3 rounded-lg border bg-card p-4 min-w-0">
                      <p className="text-xs font-medium text-muted-foreground">Widget Type</p>
                      <p className="mt-1 text-lg font-semibold">
                        {!hasMetricsFilters ? "—" : widgetLoading ? "—" : widgetInfo?.widgetType ?? "No widget"}
                      </p>
                    </div>
                  </div>

                  {/* ROI */}
                  <div>
                    <h3 className="text-sm font-semibold tracking-tight text-foreground">ROI</h3>
                    <div className="mt-3">
                      <div className="rounded-lg border bg-card p-4 min-w-0">
                        <p className="text-xs font-medium text-muted-foreground">Revenue / MRR</p>
                        <p className="mt-1 text-3xl font-semibold tabular-nums tracking-tight">
                          {customRoi != null
                            ? `${customRoi.toFixed(2)}x`
                            : roiLoading ||
                              totalBotRevenue.loading ||
                              broadcast.loading ||
                              flow.loading ||
                              !mrrFebForRoi
                              ? "—"
                              : `${(totalRevenue / mrrFebForRoi).toFixed(2)}x`}
                        </p>
                        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
                          <Input
                            placeholder="Custom Revenue"
                            value={roiRevenueInput}
                            onChange={(e) => {
                              const next = e.target.value;
                              setRoiRevenueInput(next);
                              if (!next.trim() || !roiMrrInput.trim()) {
                                setCustomRoi(null);
                                setRoiInputError(null);
                              }
                            }}
                            className="h-9 rounded-full"
                          />
                          <Input
                            placeholder="Custom MRR"
                            value={roiMrrInput}
                            onChange={(e) => {
                              const next = e.target.value;
                              setRoiMrrInput(next);
                              if (!next.trim() || !roiRevenueInput.trim()) {
                                setCustomRoi(null);
                                setRoiInputError(null);
                              }
                            }}
                            className="h-9 rounded-full"
                          />
                          <button
                            type="button"
                            className="h-9 rounded-full bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
                            onClick={() => {
                              const revenue = Number(roiRevenueInput.replace(/,/g, "").trim());
                              const mrr = Number(roiMrrInput.replace(/,/g, "").trim());
                              if (!Number.isFinite(revenue) || !Number.isFinite(mrr) || mrr <= 0) {
                                setRoiInputError("Enter valid Revenue and MRR (> 0).");
                                return;
                              }
                              setRoiInputError(null);
                              setCustomRoi(revenue / mrr);
                            }}
                          >
                            Apply
                          </button>
                        </div>
                        {roiInputError && <p className="mt-2 text-xs text-destructive">{roiInputError}</p>}
                        {roiError && <p className="mt-1 text-xs text-destructive">{roiError}</p>}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Inbox */}
                <div>
                  <h3 className="text-sm font-semibold tracking-tight text-foreground">Inbox</h3>
                  <div className="mt-3 grid gap-6 grid-cols-1 lg:grid-cols-3">
                    {metric("total_tickets_retain_sure") && (
                      <div className="min-w-0">
                        <MetricCard
                          metric={metric("total_tickets_retain_sure")!}
                          filters={metricsApplied}
                        />
                      </div>
                    )}
                    {metric("total_tickets_inbox_wise") && (
                      <div className="lg:col-span-2 min-w-0">
                        <MetricCard
                          metric={metric("total_tickets_inbox_wise")!}
                          filters={metricsApplied}
                        />
                      </div>
                    )}
                  </div>
                </div>

                {/* CSAT */}
                <div>
                  <h3 className="text-sm font-semibold tracking-tight text-foreground">CSAT</h3>
                  <div className="mt-3 grid gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
                    {metric("bot_csat_score") && (
                      <MetricCard metric={metric("bot_csat_score")!} filters={metricsApplied} />
                    )}
                    {metric("total_bot_csat_responses") && (
                      <MetricCard metric={metric("total_bot_csat_responses")!} filters={metricsApplied} />
                    )}
                    {metric("agent_csat_score") && (
                      <MetricCard metric={metric("agent_csat_score")!} filters={metricsApplied} />
                    )}
                    {metric("total_agent_csat_responses") && (
                      <MetricCard metric={metric("total_agent_csat_responses")!} filters={metricsApplied} />
                    )}
                  </div>
                </div>

                {/* Revenue */}
                <div>
                  <h3 className="text-sm font-semibold tracking-tight text-foreground">Revenue</h3>
                  <div className="mt-3 grid gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
                    <div className="rounded-xl border bg-card px-5 py-5 min-w-0">
                      <p className="min-h-10 text-sm font-semibold leading-5 text-foreground">Total revenue</p>
                      <p className="text-3xl font-semibold tabular-nums tracking-tight whitespace-nowrap">
                        {!hasMetricsFilters
                          ? "—"
                          : totalBotRevenue.loading || broadcast.loading || flow.loading
                          ? "—"
                          : `₹ ${totalRevenue.toLocaleString("en-IN")}`}
                      </p>
                      {hasMetricsFilters &&
                      !prevMonthRevenueLoading &&
                      prevMonthRevenue != null &&
                      prevMonthRevenue > 0 &&
                      !totalBotRevenue.loading &&
                      !broadcast.loading &&
                      !flow.loading ? (
                        <p className="mt-2 min-h-8 whitespace-normal break-words leading-4 text-[11px] text-muted-foreground">
                          {`${totalRevenue >= prevMonthRevenue ? "+" : ""}${(
                            ((totalRevenue - prevMonthRevenue) / prevMonthRevenue) *
                            100
                          ).toFixed(2)}% vs previous month (${totalRevenue >= prevMonthRevenue ? "+" : "-"}₹ ${Math.abs(
                            totalRevenue - prevMonthRevenue
                          ).toLocaleString("en-IN")})`}
                        </p>
                      ) : (
                        <p
                          className="mt-2 min-h-8 whitespace-normal break-words leading-4 text-[11px] opacity-0"
                          aria-hidden="true"
                        >
                          placeholder
                        </p>
                      )}
                      {(totalBotRevenue.error || broadcast.error || flow.error) && (
                        <p className="mt-1 text-xs text-destructive">
                          {totalBotRevenue.error || broadcast.error || flow.error}
                        </p>
                      )}
                    </div>
                    {metric("revenue_total_bot") && (
                      <MetricCard metric={metric("revenue_total_bot")!} filters={metricsApplied} />
                    )}
                    {metric("revenue_direct_bot") && (
                      <MetricCard metric={metric("revenue_direct_bot")!} filters={metricsApplied} />
                    )}
                    {metric("revenue_influenced_bot") && (
                      <MetricCard metric={metric("revenue_influenced_bot")!} filters={metricsApplied} />
                    )}
                  </div>
                  <div className="mt-6 grid gap-6 grid-cols-1 sm:grid-cols-2">
                    {metric("revenue_broadcast") && (
                      <MetricCard metric={metric("revenue_broadcast")!} filters={metricsApplied} />
                    )}
                    {metric("revenue_flow") && (
                      <MetricCard metric={metric("revenue_flow")!} filters={metricsApplied} />
                    )}
                  </div>
                </div>

                {/* Orders */}
                <div data-pdf-page-break-before="true">
                  <h3 className="text-sm font-semibold tracking-tight text-foreground">Orders</h3>
                  <div className="mt-3 grid gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
                    {metric("orders_placed_via_bot") && (
                      <MetricCard metric={metric("orders_placed_via_bot")!} filters={metricsApplied} />
                    )}
                    {metric("orders_placed_via_flows") && (
                      <MetricCard metric={metric("orders_placed_via_flows")!} filters={metricsApplied} />
                    )}
                    {metric("orders_placed_via_broadcasts") && (
                      <MetricCard metric={metric("orders_placed_via_broadcasts")!} filters={metricsApplied} />
                    )}
                  </div>
                </div>

                {/* Bot Overview (subsection) */}
                <div>
                  <div className="flex flex-wrap items-end justify-between gap-3">
                    <h3 className="text-sm font-semibold tracking-tight text-foreground">Bot Overview</h3>
                    <div className="flex flex-wrap items-end gap-3 rounded-lg border bg-card p-3">
                      <div className="grid gap-1">
                        <label className="text-xs font-medium text-muted-foreground">Reply Text Preset</label>
                        <select
                          className="h-9 w-56 rounded-full border border-input bg-transparent px-3 text-sm"
                          value={metricsForm.reply_text ?? ""}
                          onChange={(e) => setMetricsForm({ ...metricsForm, reply_text: e.target.value })}
                        >
                          <option value="">Select preset</option>
                          {REPLY_TEXT_PRESETS.map((preset) => (
                            <option key={preset} value={preset}>
                              {preset}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="grid gap-1">
                        <label className="text-xs font-medium text-muted-foreground">Reply Text (custom)</label>
                        <Input
                          placeholder="Reply Text"
                          value={metricsForm.reply_text ?? ""}
                          onChange={(e) => setMetricsForm({ ...metricsForm, reply_text: e.target.value })}
                          className="h-9 w-64 rounded-full"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => setMetricsApplied(metricsForm)}
                        className="h-9 rounded-full bg-primary px-5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
                      >
                        Apply
                      </button>
                    </div>
                  </div>
                  <div className="mt-3 grid gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
                    {metric("bot_total_tickets") && (
                      <MetricCard metric={metric("bot_total_tickets")!} filters={metricsApplied} />
                    )}
                    {metric("bot_automation_percent") && (
                      <MetricCard metric={metric("bot_automation_percent")!} filters={metricsApplied} />
                    )}
                    {metric("buy_now_button_count") && (
                      <MetricCard metric={metric("buy_now_button_count")!} filters={metricsApplied} />
                    )}
                    {metric("button_click_count") && (
                      <MetricCard metric={metric("button_click_count")!} filters={metricsApplied} />
                    )}
                  </div>
                  {metric("product_card_count") && (
                    <div data-pdf-exclude="true" className="mt-6 min-w-0">
                      <MetricCard metric={metric("product_card_count")!} filters={metricsApplied} />
                    </div>
                  )}
                </div>

                {/* Agent Overview (subsection) */}
                <div>
                  <h3 className="text-sm font-semibold tracking-tight text-foreground">Agent Overview</h3>
                  <div className="mt-3 grid gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
                    {metric("agent_first_resolution_time") && (
                      <MetricCard
                        metric={metric("agent_first_resolution_time")!}
                        filters={metricsApplied}
                      />
                    )}
                    {metric("agent_resolution_time") && (
                      <MetricCard
                        metric={metric("agent_resolution_time")!}
                        filters={metricsApplied}
                      />
                    )}
                    {metric("agent_wait_time") && (
                      <MetricCard
                        metric={metric("agent_wait_time")!}
                        filters={metricsApplied}
                      />
                    )}
                    {metric("number_of_billable_agents") && (
                      <MetricCard
                        metric={metric("number_of_billable_agents")!}
                        filters={metricsApplied}
                      />
                    )}
                  </div>
                </div>

                {/* Voice */}
                <div>
                  <h3 className="text-sm font-semibold tracking-tight text-foreground">Voice</h3>
                  <div className="mt-3 min-w-0">
                    {metric("revenue_voice") && (
                      <MetricCard
                        metric={metric("revenue_voice")!}
                        filters={metricsApplied}
                        hideHeader
                      />
                    )}
                  </div>
                </div>

                {/* ROI moved next to Widget */}
              </div>
            </>
          )}
        </div>
      </main>

      {selectedDealOwner && (
        <div className="fixed inset-0 z-50 bg-black/40 p-4 sm:p-6">
          <aside className="mx-auto h-[92vh] w-full max-w-7xl overflow-hidden rounded-2xl border bg-background shadow-2xl">
            <div className="flex items-center justify-between border-b px-6 py-5">
              <div>
                <h3 className="text-2xl font-semibold text-foreground">{selectedDealOwner}</h3>
                <p className="text-sm text-muted-foreground">
                  Account-level details from Active Client List
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedDealOwner(null)}
                className="text-xl text-muted-foreground hover:text-foreground"
              >
                ×
              </button>
            </div>
            <div className="h-[calc(92vh-88px)] overflow-auto p-6 space-y-5">
              {selectedAccount && (
                <section className="rounded-xl border bg-card p-5">
                  <div className="flex flex-wrap items-center gap-3 text-2xl font-bold text-foreground">
                    <span>{accountId}{accountName ? ` • ${accountName}` : ""}</span>
                    <span className="rounded-full bg-emerald-50 px-3 py-1 text-base font-medium text-emerald-700">
                      {enterpriseMidmarket}
                    </span>
                    <span className="text-base font-medium text-muted-foreground">
                      Owner: {selectedDealOwner}
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-muted-foreground">MRR (Current month)</p>
                  <p className="text-5xl font-semibold tracking-tight">{formatInr(mrrFeb)}</p>
                  <p className="mt-2 text-2xl">
                    <span className="text-muted-foreground">vs Jan {formatInr(mrrJan)}</span>
                    <span
                      className={cn(
                        "ml-4 text-xl font-semibold",
                        mrrTrend >= 0 ? "text-emerald-700" : "text-red-700"
                      )}
                    >
                      {mrrTrend >= 0 ? "+" : ""}{mrrTrend.toFixed(2)}% MoM
                    </span>
                  </p>
                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    <span className="text-2xl font-medium text-muted-foreground">Drivers</span>
                    <span className="rounded-full border bg-muted px-3 py-1 text-xl font-medium">
                      {driver}
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-muted-foreground">{reason}</p>
                  <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
                    {[
                      { label: "Platform Fee", value: pf, jan: janPf },
                      { label: "Bot Revenue", value: bot, jan: janBot },
                      { label: "Agent Revenue", value: agent, jan: janAgent },
                      { label: "Outbound Revenue", value: outb, jan: janOutb },
                      { label: "Voice Revenue", value: voice, jan: janVoice },
                    ].map((item) => {
                      const t = trendFor(item.value, item.jan);
                      return (
                        <div key={item.label} className="rounded-lg border bg-background p-3">
                          <p className="text-xs text-muted-foreground">{item.label}</p>
                          <p className="text-lg font-semibold">{formatInr(item.value)}</p>
                          <p className="mt-1 text-[11px] text-muted-foreground">
                            Jan: {formatInr(item.jan)}
                          </p>
                          <p
                            className={cn(
                              "mt-1 inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium",
                              t.delta > 0
                                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                                : t.delta < 0
                                  ? "border-red-200 bg-red-50 text-red-700"
                                  : "border-slate-200 bg-slate-100 text-slate-700"
                            )}
                          >
                            {t.delta > 0 ? "↑ " : t.delta < 0 ? "↓ " : "→ "}
                            {t.delta > 0 ? "+" : t.delta < 0 ? "-" : ""}
                            {Math.abs(t.pct).toFixed(1)}% (
                            {t.sign}
                            {formatInr(Math.abs(t.delta))}
                            ) vs Jan
                          </p>
                        </div>
                      );
                    })}
                  </div>
                  {spotlightLoading && (
                    <p className="mt-3 text-xs text-muted-foreground">Loading Jan/Feb component comparison…</p>
                  )}
                </section>
              )}
              {aclMetric ? (
                <MetricCard
                  metric={aclMetric}
                  filters={{
                    ...filters,
                    account_id: "",
                    deal_owner: selectedDealOwner,
                  }}
                  hideHeader
                  onTableRowClick={(row) => setSelectedAccount(row)}
                />
              ) : (
                <p className="text-sm text-muted-foreground">ACL metric is not configured.</p>
              )}
              {accountTypeDistributionMetric ? (
                <section className="mt-2">
                  <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Account Type Distribution (Feb)
                  </h4>
                  <MetricCard
                    metric={accountTypeDistributionMetric}
                    filters={{
                      ...filters,
                      account_id: filters.account_id ?? "",
                      deal_owner: selectedDealOwner,
                    }}
                    hideHeader
                  />
                </section>
              ) : null}
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
