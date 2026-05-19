"use client";

import * as React from "react";
import { FilterBar, type FilterValues } from "@/app/components/FilterBar";
import { getDashboardMonthRange } from "@/lib/month-range-presets";
import { MetricCard, type MetricMeta } from "@/app/components/MetricCard";
import { CustomerSuccessOverview } from "@/app/components/CustomerSuccessOverview";

function defaultFilters(): FilterValues {
  const { start_date, end_date } = getDashboardMonthRange("current");
  return {
    account_id: "",
    start_date,
    end_date,
    deal_owner: "",
    enterprise_midmarket: "",
    month: "February",
  };
}

export default function DashboardPage() {
  const [formFilters, setFormFilters] =
    React.useState<FilterValues>(defaultFilters);
  const [appliedFilters, setAppliedFilters] =
    React.useState<FilterValues>(defaultFilters);
  const [metrics, setMetrics] = React.useState<MetricMeta[]>([]);
  const [metricsLoading, setMetricsLoading] = React.useState(true);
  const [metricsError, setMetricsError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    setMetricsLoading(true);
    setMetricsError(null);
    fetch("/api/metrics")
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data: { metrics?: MetricMeta[] }) => {
        if (!cancelled && Array.isArray(data.metrics)) {
          setMetrics(data.metrics);
        }
      })
      .catch((e) => {
        if (!cancelled) {
          setMetricsError(
            e instanceof Error ? e.message : "Failed to load metrics"
          );
        }
      })
      .finally(() => {
        if (!cancelled) setMetricsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleApply = (overrides?: Partial<FilterValues>) => {
    setFormFilters((prev) => {
      const next = { ...prev, ...(overrides ?? {}) };
      setAppliedFilters(next);
      return next;
    });
  };

  const prevFiltersRef = React.useRef(formFilters);
  React.useEffect(() => {
    const hasCsFilters =
      (formFilters.deal_owner ?? "") !== "" ||
      (formFilters.enterprise_midmarket ?? "") !== "" ||
      (formFilters.month ?? "") !== "";
    if (!formFilters.account_id?.trim() && !hasCsFilters) return;
    const prev = prevFiltersRef.current;
    const changed =
      formFilters.start_date !== prev.start_date ||
      formFilters.end_date !== prev.end_date ||
      (formFilters.deal_owner ?? "") !== (prev.deal_owner ?? "") ||
      (formFilters.enterprise_midmarket ?? "") !== (prev.enterprise_midmarket ?? "");
    const monthChanged = (formFilters.month ?? "") !== (prev.month ?? "");
    if (changed || monthChanged) {
      prevFiltersRef.current = formFilters;
      setAppliedFilters(formFilters);
      return;
    }
    const t = setTimeout(() => {
      prevFiltersRef.current = formFilters;
      setAppliedFilters(formFilters);
    }, 500);
    return () => clearTimeout(t);
  }, [formFilters]);

  const hasCustomerSuccess = React.useMemo(
    () => metrics.some((m) => m.section === "customer_success"),
    [metrics]
  );

  if (metricsLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </div>
    );
  }
  if (metricsError) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <p className="text-sm text-destructive">{metricsError}</p>
      </div>
    );
  }
  if (!metrics.length) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <p className="text-sm text-muted-foreground">
          No metrics configured. Add entries to{" "}
          <code className="rounded bg-muted px-1 py-0.5">lib/metrics-config.ts</code>
        </p>
      </div>
    );
  }

  if (hasCustomerSuccess) {
    return (
      <div className="min-h-screen w-full bg-background">
        <CustomerSuccessOverview
          filters={appliedFilters}
          formFilters={formFilters}
          onFiltersChange={setFormFilters}
          onApplyFilters={handleApply}
          allMetrics={metrics}
          summaryMetric={metrics.find((m) => m.key === "customer_success_summary") ?? null}
          dealOwnerMetric={metrics.find((m) => m.key === "acl_deal_owner_performance") ?? null}
          aclMetric={metrics.find((m) => m.key === "acl_complete") ?? null}
          accountTypeDistributionMetric={metrics.find((m) => m.key === "deal_owner_account_type_distribution") ?? null}
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full bg-background">
      <div className="w-full space-y-8 px-6 py-8">
        <header>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            <span className="text-primary">CSM</span> Metrics Dashboard
          </h1>
          <p className="text-muted-foreground mt-1">
            View client metrics by account and date range.
          </p>
        </header>
        <FilterBar
          values={formFilters}
          onChange={setFormFilters}
          onApply={handleApply}
          restrictToMonthPresets
        />
        <div className="grid gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
          {metrics.map((metric) => (
            <div
              key={metric.key}
              className={
                metric.cardType === "table" || metric.cardType === "chart"
                  ? "sm:col-span-2 lg:col-span-3 min-w-0"
                  : "min-w-0"
              }
            >
              <MetricCard metric={metric} filters={appliedFilters} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
