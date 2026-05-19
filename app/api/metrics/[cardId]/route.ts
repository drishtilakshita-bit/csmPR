import { NextRequest, NextResponse } from "next/server";
import { getCardIdByMetricKey, getMetricConfig, getMetricConfigByCardId } from "@/lib/metrics-config";
import {
  runMetabaseCardQuery,
  runMetabaseDashboardCardQuery,
  normalizeCardResponse,
} from "@/lib/metabase";
import type { MetabaseFilterParams } from "@/lib/metabase";
import { mapLcAccountIdToHdAccountId } from "@/lib/googleSheetMappings";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ cardId: string }> }
) {
  const { cardId: cardIdParam } = await params;
  const searchParams = request.nextUrl.searchParams;
  const account_id = searchParams.get("account_id") ?? "";
  const start_date = searchParams.get("start_date") ?? "";
  const end_date = searchParams.get("end_date") ?? "";
  const deal_owner = searchParams.get("deal_owner") ?? "";
  const enterprise_midmarket = searchParams.get("enterprise_midmarket") ?? "";
  const reply_text = searchParams.get("reply_text") ?? "";
  const month = searchParams.get("month") ?? "";

  let cardId: number;
  let hasDateFilters = true;
  let config: ReturnType<typeof getMetricConfig> = undefined;
  const asNumber = Number(cardIdParam);
  if (Number.isInteger(asNumber) && String(asNumber) === cardIdParam) {
    cardId = asNumber;
    config = getMetricConfigByCardId(cardId);
  } else {
    config = getMetricConfig(cardIdParam);
    const resolved = getCardIdByMetricKey(cardIdParam);
    if (resolved === undefined) {
      return NextResponse.json(
        { error: `Unknown metric or card ID: ${cardIdParam}` },
        { status: 404 }
      );
    }
    cardId = resolved;
    hasDateFilters = config?.hasDateFilters !== false;
  }

  const optionalAccountId = config?.optionalAccountId === true;
  const requiresEndDateOnly = config?.requiresEndDateOnly === true;
  if (!optionalAccountId && !account_id) {
    return NextResponse.json(
      { error: "Missing required parameter: account_id" },
      { status: 400 }
    );
  }

  if (hasDateFilters && (!start_date || !end_date)) {
    return NextResponse.json(
      {
        error:
          "This metric requires start_date and end_date parameters.",
      },
      { status: 400 }
    );
  }
  if (requiresEndDateOnly && !end_date) {
    return NextResponse.json(
      { error: "This metric requires end_date parameter." },
      { status: 400 }
    );
  }

  if (!config && !Number.isInteger(Number(cardIdParam))) {
    config = getMetricConfig(cardIdParam);
  }
  const dateTagOptions =
    config?.dateStartTag ||
    config?.dateEndTag ||
    config?.accountIdTag ||
    config?.accountIdAsCategory ||
    config?.dateParamsAsCategory ||
    config?.dealOwnerTag ||
    config?.enterpriseMidmarketTag ||
    config?.replyTextTag ||
    config?.monthTag
      ? {
          startTag: config.dateStartTag ?? "start_date",
          endTag: config.dateEndTag ?? "end_date",
          accountTag: config.accountIdTag ?? "account_id",
          accountIdAsCategory: config.accountIdAsCategory === true,
          dateParamsAsCategory: config.dateParamsAsCategory === true,
          dealOwnerTag: config.dealOwnerTag ?? "deal_owner",
          enterpriseMidmarketTag:
            config.enterpriseMidmarketTag ?? "enterprise_midmarket",
          replyTextTag: config.replyTextTag ?? "Reply_Text",
          endDateOnlyTag: config.endDateTag,
          monthTag: config.monthTag ?? "month",
        }
      : config?.endDateTag
        ? { endDateOnlyTag: config.endDateTag }
        : undefined;

    try {
    let effectiveCardId = cardId;
    let effectiveDashboardId = config?.dashboardId;
    if (cardIdParam === "customer_success_summary") {
      const normalizedMonth = month.trim().toLowerCase();
      if (normalizedMonth === "january") {
        effectiveCardId = 3182;
        effectiveDashboardId = 466;
      } else if (normalizedMonth === "february") {
        effectiveCardId = 3158;
        effectiveDashboardId = 466;
      }
    }

    const includeAccountId = config?.hasAccountIdFilter !== false;
    let queryParams: MetabaseFilterParams = {
      ...(includeAccountId ? { account_id: account_id || "" } : { account_id: "" }),
      ...(hasDateFilters && start_date && end_date ? { start_date, end_date } : {}),
      ...(requiresEndDateOnly && end_date ? { end_date } : {}),
      ...(config?.hasDealOwnerFilter && deal_owner ? { deal_owner } : {}),
      ...(config?.hasEnterpriseMidmarketFilter && enterprise_midmarket
        ? { enterprise_midmarket }
        : {}),
      ...(config?.hasReplyTextFilter && reply_text ? { reply_text } : {}),
      ...(config?.hasMonthFilter && month ? { month } : {}),
    };

    // For specific Metabase cards, Metabase expects `account_id` to be hd_account_id.
    // We map from the LC Account ID using your provided Google Sheet.
    if (effectiveCardId === 3199 || effectiveCardId === 3200) {
      const lc = String(queryParams.account_id ?? "").trim();
      if (lc) {
        const mapped = await mapLcAccountIdToHdAccountId(lc);
        if (mapped) {
          queryParams = { ...queryParams, account_id: mapped };
        }
      }
    }
    const runQuery = (
      dashboardId: number | undefined,
      effectiveId: number,
      params: MetabaseFilterParams
    ) =>
      dashboardId
        ? runMetabaseDashboardCardQuery(dashboardId, effectiveId, params, dateTagOptions)
        : runMetabaseCardQuery(effectiveId, params, dateTagOptions);

    if (cardIdParam === "customer_success_summary" && month.trim().toLowerCase() === "february") {
      const [janRaw, febRaw] = await Promise.all([
        runQuery(466, 3182, { ...queryParams, month: "January" }),
        runQuery(466, 3158, { ...queryParams, month: "February" }),
      ]);
      const jan = normalizeCardResponse(janRaw);
      const feb = normalizeCardResponse(febRaw);
      return NextResponse.json({
        cols: [...(jan.cols ?? []), ...(feb.cols ?? [])],
        rows: [[...(jan.rows?.[0] ?? []), ...(feb.rows?.[0] ?? [])]],
      });
    }
    try {
      const result = await runQuery(effectiveDashboardId, effectiveCardId, queryParams);
      const normalized = normalizeCardResponse(result);
      return NextResponse.json(normalized);
    } catch (firstErr) {
      // Card 3066 has had template-tag mismatches across environments.
      // Retry with alternate account/date tag names (and optional account) before failing.
      if (effectiveCardId === 3066) {
        const attempts: Array<{
          opts: {
            startTag: string;
            endTag: string;
            accountTag: string;
            dealOwnerTag: string;
            enterpriseMidmarketTag: string;
            replyTextTag: string;
            endDateOnlyTag?: string;
            monthTag: string;
          };
          params: MetabaseFilterParams;
        }> = [
          {
            opts: {
              startTag: "date_start",
              endTag: "date_end",
              accountTag: "account",
              dealOwnerTag: config?.dealOwnerTag ?? "deal_owner",
              enterpriseMidmarketTag: config?.enterpriseMidmarketTag ?? "enterprise_midmarket",
              replyTextTag: config?.replyTextTag ?? "Reply_Text",
              endDateOnlyTag: config?.endDateTag,
              monthTag: config?.monthTag ?? "month",
            },
            params: queryParams,
          },
          {
            opts: {
              startTag: "start_date",
              endTag: "end_date",
              accountTag: "account_id",
              dealOwnerTag: config?.dealOwnerTag ?? "deal_owner",
              enterpriseMidmarketTag: config?.enterpriseMidmarketTag ?? "enterprise_midmarket",
              replyTextTag: config?.replyTextTag ?? "Reply_Text",
              endDateOnlyTag: config?.endDateTag,
              monthTag: config?.monthTag ?? "month",
            },
            params: queryParams,
          },
          {
            opts: {
              startTag: "date_start",
              endTag: "date_end",
              accountTag: "account_id",
              dealOwnerTag: config?.dealOwnerTag ?? "deal_owner",
              enterpriseMidmarketTag: config?.enterpriseMidmarketTag ?? "enterprise_midmarket",
              replyTextTag: config?.replyTextTag ?? "Reply_Text",
              endDateOnlyTag: config?.endDateTag,
              monthTag: config?.monthTag ?? "month",
            },
            params: { ...queryParams, account_id: "" },
          },
        ];
        let lastErr: unknown = firstErr;
        for (const attempt of attempts) {
          try {
            const fallbackResult = await (
              effectiveDashboardId
                ? runMetabaseDashboardCardQuery(
                    effectiveDashboardId,
                    effectiveCardId,
                    attempt.params,
                    attempt.opts
                  )
                : runMetabaseCardQuery(effectiveCardId, attempt.params, attempt.opts)
            );
            return NextResponse.json(normalizeCardResponse(fallbackResult));
          } catch (attemptErr) {
            lastErr = attemptErr;
          }
        }
        throw lastErr;
      }
      throw firstErr;
    }
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Metabase request failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
