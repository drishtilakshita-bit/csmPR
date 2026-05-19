import { NextResponse } from "next/server";
import { METRIC_KEYS, getMetricConfig } from "@/lib/metrics-config";

export async function GET() {
  const metrics = METRIC_KEYS.map((key) => {
    const config = getMetricConfig(key);
    return config
      ? {
          key,
          label: config.label,
          cardType: config.cardType,
          section: config.section,
          isCurrency: config.isCurrency ?? false,
          accountIdTag: config.accountIdTag,
          hasAccountIdFilter: config.hasAccountIdFilter ?? true,
          hasReplyTextFilter: config.hasReplyTextFilter ?? false,
          replyTextTag: config.replyTextTag,
          requiresEndDateOnly: config.requiresEndDateOnly ?? false,
          endDateTag: config.endDateTag,
          hasDateFilters: config.hasDateFilters !== false,
          optionalAccountId: config.optionalAccountId ?? false,
          hasDealOwnerFilter: config.hasDealOwnerFilter ?? false,
          dealOwnerTag: config.dealOwnerTag,
          hasEnterpriseMidmarketFilter: config.hasEnterpriseMidmarketFilter ?? false,
          enterpriseMidmarketTag: config.enterpriseMidmarketTag,
          hasMonthFilter: config.hasMonthFilter ?? false,
          monthTag: config.monthTag,
          columnLabels: config.columnLabels,
          columnLabelMap: config.columnLabelMap,
          compareToPreviousMonth: config.compareToPreviousMonth ?? false,
        }
      : null;
  }).filter(Boolean);

  return NextResponse.json({ metrics });
}
