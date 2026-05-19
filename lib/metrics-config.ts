/**
 * Maps metric keys to Metabase card IDs and display config.
 * Metabase base URL: https://metabase.limechat.ai
 * Use date_start / date_end for cards that have date filters; some cards (e.g. total_inboxes) only have account_id.
 */
export type MetricCardType = "number" | "table" | "chart" | "summary";

export type MetricSectionKey =
  | "inbox_volume"
  | "csat"
  | "revenue"
  | "orders"
  | "bot_overview"
  | "agent_overview"
  | "customer_success";

export interface MetricConfig {
  cardId: number;
  /** Optional dashboard context to run this card via /api/dashboard/:id route. */
  dashboardId?: number;
  label: string;
  cardType: MetricCardType;
  /** Section for grouping. Customer Success metrics use "customer_success". */
  section?: MetricSectionKey;
  /** Format numeric value as currency (₹). */
  isCurrency?: boolean;
  /** Override Metabase template tag for account id (default: account_id). */
  accountIdTag?: string;
  /**
   * When true, pass account_id to Metabase as category (text).
   * Use when the native question declares account_id as text, not Number.
   */
  accountIdAsCategory?: boolean;
  /**
   * When true, pass start_date/end_date as category (Metabase text vars), not date/single.
   */
  dateParamsAsCategory?: boolean;
  /** If false, do not pass account_id even when provided in UI filters. */
  hasAccountIdFilter?: boolean;
  /** If true, pass reply_text to Metabase when provided. */
  hasReplyTextFilter?: boolean;
  /** Override Metabase template tag for reply text (default: Reply_Text). */
  replyTextTag?: string;
  /** If true, this metric requires only end_date (sent as a single template tag). */
  requiresEndDateOnly?: boolean;
  /** Template tag name for the end-date-only filter (default: date). */
  endDateTag?: string;
  /** If false, only account_id is sent to Metabase (no date_start/date_end). Default true. */
  hasDateFilters?: boolean;
  /** If true, account_id is not required (e.g. Customer Success overview). */
  optionalAccountId?: boolean;
  /** If true, pass deal_owner to Metabase when provided. */
  hasDealOwnerFilter?: boolean;
  /** Override Metabase template tag for deal owner (default: deal_owner). */
  dealOwnerTag?: string;
  /** If true, pass enterprise_midmarket to Metabase when provided. */
  hasEnterpriseMidmarketFilter?: boolean;
  /** Override Metabase template tag for enterprise/midmarket (default: enterprise_midmarket). */
  enterpriseMidmarketTag?: string;
  /** If true, pass month to Metabase when provided. */
  hasMonthFilter?: boolean;
  /** Override Metabase template tag for month (default: month). */
  monthTag?: string;
  /** Override table column headers by order (index = column index). */
  columnLabels?: string[];
  /** Map Metabase column names to display labels (overrides columnLabels when present). */
  columnLabelMap?: Record<string, string>;
  dateStartTag?: string;
  dateEndTag?: string;
  /** Compare to the full calendar month before the selected month (when the filter range is one full month). */
  compareToPreviousMonth?: boolean;
}

export const METRICS_CONFIG: Record<string, MetricConfig> = {
  total_tickets_retain_sure: {
    cardId: 2873,
    label: "Total Tickets",
    cardType: "number",
    section: "inbox_volume",
    hasDateFilters: true,
    dateStartTag: "start_date",
    dateEndTag: "end_date",
  },
  average_weekly_tickets: {
    cardId: 3116,
    label: "Average Weekly Tickets",
    cardType: "number",
    section: "inbox_volume",
    hasDateFilters: true,
    dateStartTag: "date_start",
    dateEndTag: "date_end",
  },
  total_inboxes: {
    cardId: 3117,
    label: "Total Inboxes",
    cardType: "table",
    section: "inbox_volume",
    hasDateFilters: false,
  },
  total_tickets_inbox_wise: {
    cardId: 3123,
    label: "Total Tickets Inbox Wise",
    cardType: "table",
    section: "inbox_volume",
    hasDateFilters: true,
    dateStartTag: "date_start",
    dateEndTag: "date_end",
  },

  /**
   * Metrics Overview (inside Customer Success) — CSAT
   */
  bot_csat_score: {
    cardId: 2747,
    label: "Bot CSAT",
    cardType: "number",
    section: "csat",
    hasDateFilters: true,
  },
  total_bot_csat_responses: {
    cardId: 3148,
    label: "No of people who participated in BOT CSAT",
    cardType: "number",
    section: "csat",
    hasDateFilters: true,
  },
  agent_csat_score: {
    cardId: 3141,
    label: "Agent CSAT",
    cardType: "number",
    section: "csat",
    hasDateFilters: true,
  },
  total_agent_csat_responses: {
    cardId: 3147,
    label: "No of people who participated in Agent CSAT",
    cardType: "number",
    section: "csat",
    hasDateFilters: true,
  },

  /**
   * Metrics Overview — Revenue (scalar ₹ values)
   */
  revenue_direct_bot: {
    cardId: 3017,
    label: "Bot direct revenue",
    cardType: "number",
    section: "revenue",
    hasDateFilters: true,
    isCurrency: true,
  },
  revenue_influenced_bot: {
    cardId: 3013,
    label: "Bot influenced revenue",
    cardType: "number",
    section: "revenue",
    hasDateFilters: true,
    isCurrency: true,
  },
  revenue_total_bot: {
    cardId: 3140,
    label: "Bot revenue",
    cardType: "number",
    section: "revenue",
    hasDateFilters: true,
    isCurrency: true,
  },
  revenue_broadcast: {
    cardId: 3143,
    label: "Broadcast revenue",
    cardType: "number",
    section: "revenue",
    hasDateFilters: true,
    isCurrency: true,
  },
  revenue_flow: {
    cardId: 3144,
    label: "Flow revenue",
    cardType: "number",
    section: "revenue",
    hasDateFilters: true,
    isCurrency: true,
    accountIdAsCategory: true,
    dateParamsAsCategory: true,
  },
  revenue_voice: {
    cardId: 3197,
    label: "Voice revenue",
    cardType: "table",
    section: "revenue",
    hasDateFilters: true,
    isCurrency: true,
    columnLabelMap: {
      acceptance_rate_pct: "Acceptance Rate %",
    },
  },
  web_widget_type: {
    cardId: 3201,
    label: "Web Widget Type",
    cardType: "table",
    section: "revenue",
    hasDateFilters: false,
    hasAccountIdFilter: true,
    accountIdTag: "account_id",
  },

  /**
   * Metrics Overview — Orders (scalar values)
   * We reuse existing Metabase cards; labels are per the UI spec.
   */
  orders_placed_via_bot: {
    cardId: 3179,
    label: "Orders placed via bot",
    cardType: "number",
    section: "orders",
    hasDateFilters: true,
  },
  orders_placed_via_flows: {
    cardId: 3146,
    label: "Orders placed via flows",
    cardType: "number",
    section: "orders",
    hasDateFilters: true,
  },
  orders_placed_via_broadcasts: {
    cardId: 3145,
    label: "Orders placed via broadcasts",
    cardType: "number",
    section: "orders",
    hasDateFilters: true,
  },

  /**
   * Bot Overview (cards 2854, 3066, 2951, 3162, 3163)
   */
  bot_total_tickets: {
    cardId: 2854,
    label: "Total Bot Tickets",
    cardType: "number",
    section: "bot_overview",
    hasDateFilters: true,
  },
  bot_automation_percent: {
    cardId: 3066,
    label: "Bot automation %",
    cardType: "number",
    section: "bot_overview",
    hasDateFilters: true,
    accountIdTag: "account_id",
    dateStartTag: "start_date",
    dateEndTag: "end_date",
  },
  product_card_count: {
    cardId: 2951,
    label: "Product Card Count",
    cardType: "table",
    section: "bot_overview",
    hasDateFilters: true,
    columnLabelMap: {
      product_name: "Product Name",
      product_count: "Product Count",
    },
  },
  button_click_count: {
    cardId: 3162,
    label: "Button Click Count",
    cardType: "number",
    section: "bot_overview",
    hasDateFilters: true,
    hasReplyTextFilter: true,
    replyTextTag: "Reply_Text",
  },
  buy_now_button_count: {
    cardId: 3163,
    label: "Buy Now button count",
    cardType: "number",
    section: "bot_overview",
    hasDateFilters: true,
    // This card uses template tag name "account" not "account_id"
    accountIdTag: "account",
  },

  /**
   * Agent Overview (cards 3164, 3180, 3181, 2814)
   */
  agent_first_resolution_time: {
    cardId: 3164,
    label: "First Resolution Time",
    cardType: "number",
    section: "agent_overview",
    hasDateFilters: true,
    compareToPreviousMonth: true,
  },
  agent_resolution_time: {
    cardId: 3180,
    label: "Resolution Time",
    cardType: "number",
    section: "agent_overview",
    hasDateFilters: true,
    compareToPreviousMonth: true,
  },
  agent_wait_time: {
    cardId: 3181,
    label: "Wait Time",
    cardType: "number",
    section: "agent_overview",
    hasDateFilters: true,
    compareToPreviousMonth: true,
  },
  number_of_billable_agents: {
    cardId: 2814,
    label: "Number of billable agents",
    cardType: "number",
    section: "agent_overview",
    hasDateFilters: false,
    requiresEndDateOnly: true,
    endDateTag: "date",
    compareToPreviousMonth: true,
  },

  /** Customer Success Overview (cards 3158, 3159, 3160) */
  customer_success_summary: {
    cardId: 3158,
    dashboardId: 466,
    label: "Customer Success Summary",
    cardType: "summary",
    section: "customer_success",
    hasDateFilters: false,
    optionalAccountId: true,
    hasAccountIdFilter: true,
    hasDealOwnerFilter: true,
    dealOwnerTag: "deal_owner",
    hasEnterpriseMidmarketFilter: true,
    enterpriseMidmarketTag: "enterprise_midmarket",
    hasMonthFilter: true,
    monthTag: "month",
    accountIdTag: "account_id",
  },
  acl_deal_owner_performance: {
    cardId: 3159,
    dashboardId: 467,
    label: "Deal Owner Performance",
    cardType: "table",
    section: "customer_success",
    hasDateFilters: false,
    optionalAccountId: true,
    hasAccountIdFilter: false,
    hasDealOwnerFilter: true,
    dealOwnerTag: "deal_owner",
    hasEnterpriseMidmarketFilter: true,
    enterpriseMidmarketTag: "enterprise_midmarket",
    hasMonthFilter: true,
    monthTag: "month",
    columnLabelMap: {
      deal_owner: "Deal Owner",
      mrr_feb: "MRR Feb",
      mrr_jan: "MRR Jan",
      mom_pct: "MOM %",
    },
  },
  acl_complete: {
    cardId: 3160,
    label: "Active Client List - February",
    cardType: "table",
    section: "customer_success",
    hasDateFilters: false,
    optionalAccountId: true,
    hasAccountIdFilter: true,
    hasDealOwnerFilter: true,
    hasEnterpriseMidmarketFilter: true,
    hasMonthFilter: false,
    columnLabelMap: {
      account_id: "LC Account ID",
      account_name: "Account Name",
      mrr_feb: "MRR Feb",
      mrr_jan: "MRR Jan",
      mrr_trend: "MOM %",
      primary_change_driver: "Primary Change Driver",
      change_reason: "Change Reason",
    },
  },
  deal_owner_account_type_distribution: {
    cardId: 3195,
    label: "Account Type Distribution (Feb)",
    cardType: "table",
    section: "customer_success",
    hasDateFilters: false,
    optionalAccountId: true,
    hasAccountIdFilter: true,
    hasDealOwnerFilter: true,
    dealOwnerTag: "deal_owner",
    columnLabelMap: {
      deal_owner: "Deal Owner",
      account_type: "Account Type",
      account_distribution_pct: "Account Distribution %",
      revenue_distribution_pct: "Revenue Distribution %",
    },
  },
  contract_revenue_outbound: {
    cardId: 3186,
    label: "Contract Revenue — Outbound",
    cardType: "number",
    section: "customer_success",
    isCurrency: true,
    hasDateFilters: false,
    optionalAccountId: true,
    hasAccountIdFilter: true,
    hasDealOwnerFilter: true,
    hasEnterpriseMidmarketFilter: false,
    hasMonthFilter: true,
    accountIdTag: "account_id",
    dealOwnerTag: "deal_owner",
    monthTag: "month",
  },
};

export const METRIC_KEYS = Object.keys(METRICS_CONFIG);

export function getCardIdByMetricKey(metricKey: string): number | undefined {
  return METRICS_CONFIG[metricKey]?.cardId;
}

export function getMetricConfig(metricKey: string): MetricConfig | undefined {
  return METRICS_CONFIG[metricKey];
}

export function getMetricConfigByCardId(cardId: number): MetricConfig | undefined {
  return Object.values(METRICS_CONFIG).find((c) => c.cardId === cardId);
}
