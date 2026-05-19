/**
 * Metabase API helper: build parameters and run card query.
 * Limechat Metabase uses template tags: account_id, date_start, date_end (or account_id only for some cards).
 * Server-only; never expose METABASE_API_KEY to the client.
 */

export interface MetabaseFilterParams {
  account_id: string;
  /** Sent to Metabase as date_start (optional for cards that don't use dates). */
  start_date?: string;
  /** Sent to Metabase as date_end (optional for cards that don't use dates). */
  end_date?: string;
  deal_owner?: string;
  enterprise_midmarket?: string;
  reply_text?: string;
  month?: string;
}

export interface MetabaseParameter {
  type: string;
  value: string;
  target: [string, [string, string]];
}

/** Options for date parameter template tag names (Metabase cards use either start_date/end_date or date_start/date_end). */
export interface DateTagOptions {
  startTag?: string;
  endTag?: string;
  accountTag?: string;
  /** When true, send account_id as Metabase `category` (card expects text), not `number/=`. */
  accountIdAsCategory?: boolean;
  /**
   * When true, send start/end date filters as `category` (Metabase text variables), not `date/single`.
   */
  dateParamsAsCategory?: boolean;
  dealOwnerTag?: string;
  enterpriseMidmarketTag?: string;
  replyTextTag?: string;
  endDateOnlyTag?: string;
  monthTag?: string;
}

/**
 * Build Metabase parameters.
 * Uses account_id plus optional date params. Tag names can be overridden (default: start_date, end_date).
 */
export function buildMetabaseParameters(
  params: MetabaseFilterParams,
  options?: DateTagOptions
): MetabaseParameter[] {
  const startTag = options?.startTag ?? "start_date";
  const endTag = options?.endTag ?? "end_date";
  const accountTag = options?.accountTag ?? "account_id";
  const dealOwnerTag = options?.dealOwnerTag ?? "deal_owner";
  const enterpriseMidmarketTag = options?.enterpriseMidmarketTag ?? "enterprise_midmarket";
  const replyTextTag = options?.replyTextTag ?? "Reply_Text";
  const endDateOnlyTag = options?.endDateOnlyTag ?? "date";
  const monthTag = options?.monthTag ?? "month";
  const result: MetabaseParameter[] = [];
  // Only send account_id when provided; sending account_id="" causes Metabase to filter to nothing.
  if (params.account_id != null && params.account_id.trim() !== "") {
    const accountValue = params.account_id.trim();
    const isNumericAccount = /^-?\d+(\.\d+)?$/.test(accountValue);
    const accountType =
      options?.accountIdAsCategory === true
        ? "category"
        : isNumericAccount
          ? "number/="
          : "category";
    result.push({
      type: accountType,
      value: accountValue,
      target: ["variable", ["template-tag", accountTag]],
    });
  }
  const dateParamType =
    options?.dateParamsAsCategory === true ? "category" : "date/single";

  if (params.start_date != null && params.start_date !== "") {
    result.push({
      type: dateParamType,
      value: params.start_date,
      target: ["variable", ["template-tag", startTag]],
    });
  }
  if (params.end_date != null && params.end_date !== "") {
    // If a card uses a single end-date-only tag (e.g. \"date\" for billable agents),
    // only send that tag and skip the standard endTag (\"end_date\").
    if (options?.endDateOnlyTag) {
      result.push({
        type: dateParamType,
        value: params.end_date,
        target: ["variable", ["template-tag", endDateOnlyTag]],
      });
    } else {
      result.push({
        type: dateParamType,
        value: params.end_date,
        target: ["variable", ["template-tag", endTag]],
      });
    }
  }
  if (params.deal_owner != null && params.deal_owner !== "") {
    result.push({
      type: "category",
      value: params.deal_owner,
      target: ["variable", ["template-tag", dealOwnerTag]],
    });
  }
  if (params.enterprise_midmarket != null && params.enterprise_midmarket !== "") {
    result.push({
      type: "category",
      value: params.enterprise_midmarket,
      target: ["variable", ["template-tag", enterpriseMidmarketTag]],
    });
  }
  if (params.reply_text != null && params.reply_text !== "") {
    result.push({
      type: "category",
      value: params.reply_text,
      target: ["variable", ["template-tag", replyTextTag]],
    });
  }
  if (params.month != null && params.month !== "") {
    result.push({
      type: "category",
      value: params.month,
      target: ["variable", ["template-tag", monthTag]],
    });
  }
  return result;
}

export interface MetabaseQueryResponse {
  data: {
    cols: Array<{ name: string; display_name: string; base_type?: string }>;
    rows: unknown[][];
    rows_truncated?: number;
  };
}

export async function runMetabaseCardQuery(
  cardId: number,
  params: MetabaseFilterParams,
  options?: DateTagOptions
): Promise<MetabaseQueryResponse> {
  const baseUrl = process.env.METABASE_SITE_URL;
  const apiKey = process.env.METABASE_API_KEY;

  if (!baseUrl || !apiKey) {
    throw new Error("METABASE_SITE_URL and METABASE_API_KEY must be set");
  }

  const url = `${baseUrl.replace(/\/$/, "")}/api/card/${cardId}/query`;
  const parameters = buildMetabaseParameters(params, options);

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-KEY": apiKey,
      "Cache-Control": "no-store",
    },
    body: JSON.stringify({
      ignore_cache: true,
      parameters,
    }),
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Metabase API error ${res.status}: ${text}`);
  }

  const json = (await res.json()) as MetabaseQueryResponse;
  return json;
}

interface DashboardParamMeta {
  id: string;
  slug?: string;
  name?: string;
  type?: string;
}

interface DashboardParamMapping {
  parameter_id?: string;
  target?: [string, [string, string]];
}

interface DashboardDashcardMeta {
  id?: number;
  card_id?: number;
  card?: { id?: number };
  parameter_mappings?: DashboardParamMapping[];
}

interface DashboardMeta {
  dashcards?: DashboardDashcardMeta[];
  parameters?: DashboardParamMeta[];
}

interface DashboardCardContext {
  dashcardId: number;
  dashboardParameters: DashboardParamMeta[];
  parameterMappings: DashboardParamMapping[];
}

const DASHCARD_CACHE = new Map<string, DashboardCardContext>();

async function resolveDashboardDashcardContext(
  baseUrl: string,
  apiKey: string,
  dashboardId: number,
  cardId: number
): Promise<DashboardCardContext> {
  const cacheKey = `${dashboardId}:${cardId}`;
  const cached = DASHCARD_CACHE.get(cacheKey);
  if (cached != null) return cached;

  const url = `${baseUrl.replace(/\/$/, "")}/api/dashboard/${dashboardId}`;
  const res = await fetch(url, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      "X-API-KEY": apiKey,
      "Cache-Control": "no-store",
    },
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Metabase dashboard API error ${res.status}: ${text}`);
  }
  const json = (await res.json()) as DashboardMeta;
  const dashcard = json.dashcards?.find(
    (d) => d.card_id === cardId || d.card?.id === cardId
  );
  if (!dashcard?.id) {
    throw new Error(`Card ${cardId} not found in dashboard ${dashboardId}`);
  }
  const ctx: DashboardCardContext = {
    dashcardId: dashcard.id,
    dashboardParameters: json.parameters ?? [],
    parameterMappings: dashcard.parameter_mappings ?? [],
  };
  DASHCARD_CACHE.set(cacheKey, ctx);
  return ctx;
}

export async function runMetabaseDashboardCardQuery(
  dashboardId: number,
  cardId: number,
  params: MetabaseFilterParams,
  options?: DateTagOptions
): Promise<MetabaseQueryResponse> {
  const baseUrl = process.env.METABASE_SITE_URL;
  const apiKey = process.env.METABASE_API_KEY;

  if (!baseUrl || !apiKey) {
    throw new Error("METABASE_SITE_URL and METABASE_API_KEY must be set");
  }

  const ctx = await resolveDashboardDashcardContext(baseUrl, apiKey, dashboardId, cardId);
  const url = `${baseUrl.replace(/\/$/, "")}/api/dashboard/${dashboardId}/dashcard/${ctx.dashcardId}/card/${cardId}/query`;
  const cardParameters = buildMetabaseParameters(params, options);

  const parameters = cardParameters
    .map((p) => {
      const templateTag = p.target?.[1]?.[1];
      if (!templateTag) return null;
      const mapping = ctx.parameterMappings.find(
        (m) => m.target?.[0] === "variable" && m.target?.[1]?.[1] === templateTag
      );
      if (!mapping?.parameter_id) return null;
      const dashboardParam = ctx.dashboardParameters.find(
        (dp) => dp.id === mapping.parameter_id
      );
      return {
        id: mapping.parameter_id,
        type: dashboardParam?.type ?? p.type,
        value: p.value,
      };
    })
    .filter(Boolean);

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-KEY": apiKey,
      "Cache-Control": "no-store",
    },
    body: JSON.stringify({
      ignore_cache: true,
      parameters,
    }),
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Metabase dashboard query error ${res.status}: ${text}`);
  }
  const json = (await res.json()) as MetabaseQueryResponse;
  return json;
}

export function normalizeCardResponse(res: MetabaseQueryResponse) {
  return {
    cols: res.data?.cols ?? [],
    rows: res.data?.rows ?? [],
  };
}
