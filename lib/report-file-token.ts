import { createHmac, timingSafeEqual } from "crypto";

const V = 1 as const;

export type ReportFileTokenPayload = {
  v: typeof V;
  exp: number;
  account_id: string;
  start_date: string;
  end_date: string;
  metric_key: "total_tickets_inbox_wise" | "product_card_count";
  deal_owner?: string;
  enterprise_midmarket?: string;
  reply_text?: string;
  month?: string;
};

function signingSecret(): string {
  return (
    process.env.REPORT_FILE_DOWNLOAD_SECRET?.trim() ||
    process.env.SCALER_INTERNAL_PASS?.trim() ||
    ""
  );
}

/** Returns null if no secret configured (caller skips links). */
export function createReportFileDownloadToken(
  input: Omit<ReportFileTokenPayload, "v" | "exp">,
  ttlSec = 7 * 24 * 60 * 60
): string | null {
  const secret = signingSecret();
  if (!secret) return null;
  const exp = Math.floor(Date.now() / 1000) + ttlSec;
  const body: ReportFileTokenPayload = {
    v: V,
    exp,
    ...input,
    metric_key: input.metric_key,
  };
  const json = JSON.stringify(body);
  const b64 = Buffer.from(json, "utf8").toString("base64url");
  const sig = createHmac("sha256", secret).update(b64).digest();
  const sigUrl = Buffer.from(sig).toString("base64url");
  return `${b64}.${sigUrl}`;
}

export function verifyReportFileDownloadToken(
  token: string
): ReportFileTokenPayload | null {
  const secret = signingSecret();
  if (!secret) return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [b64, sigUrl] = parts;
  if (!b64 || !sigUrl) return null;
  let expected: Buffer;
  try {
    expected = createHmac("sha256", secret).update(b64).digest();
  } catch {
    return null;
  }
  let actual: Buffer;
  try {
    actual = Buffer.from(sigUrl, "base64url");
  } catch {
    return null;
  }
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    return null;
  }
  let parsed: ReportFileTokenPayload;
  try {
    parsed = JSON.parse(Buffer.from(b64, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (parsed.v !== V || typeof parsed.exp !== "number") return null;
  if (Math.floor(Date.now() / 1000) > parsed.exp) return null;
  if (
    parsed.metric_key !== "total_tickets_inbox_wise" &&
    parsed.metric_key !== "product_card_count"
  ) {
    return null;
  }
  return parsed;
}
