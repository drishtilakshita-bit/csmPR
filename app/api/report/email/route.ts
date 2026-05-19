import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import type { ReportFilters } from "@/lib/report";
import { buildMetricsReport } from "@/lib/report";
import {
  renderEmailHtmlTemplate,
} from "@/lib/email-composition";
import { Agent } from "undici";
import {
  buildBigTableExcelAttachments,
  splitInlineAndBigTableRows,
} from "@/lib/report-email-packaging";
import { buildRetryPlan, buildTerminalFailureAlert } from "@/lib/report-recovery";
import { normalizeRecipients, validateSendInput } from "@/lib/report-send-validation";
import {
  attachmentPayloadDiagnostics,
  buildScalerMultipartFormData,
  toScalerAttachmentJson,
} from "@/lib/scaler-email";
import { createReportFileDownloadToken } from "@/lib/report-file-token";

type SendPayload = {
  to?: string;
  cc?: string[] | string;
  filters?: {
    account_id?: string;
    start_date?: string;
    end_date?: string;
    deal_owner?: string;
    enterprise_midmarket?: string;
    reply_text?: string;
    month?: string;
  };
  subject?: string;
  body?: string;
  forceResend?: boolean;
  simulateDeliveryFailure?: boolean;
};

const ALLOW_INSECURE_TLS_FOR_SCALER =
  process.env.ALLOW_INSECURE_TLS_FOR_SCALER === "true";
const SCALER_SEND_URL =
  process.env.SCALER_SEND_URL ??
  "https://nik-django-canr.limechat.ai/api/v1/send/";
const SCALER_INTERNAL_PASS = process.env.SCALER_INTERNAL_PASS?.trim() ?? "";
const SCALER_ACCOUNT_ID = process.env.SCALER_ACCOUNT_ID?.trim() || "1";
const SCALER_SEND_AS_MULTIPART = process.env.SCALER_SEND_AS_MULTIPART === "true";
const SCALER_ATTACHMENTS_JSON_KEY =
  process.env.SCALER_ATTACHMENTS_JSON_KEY?.trim() || "attachments";
const SCALER_MULTIPART_FILE_FIELD =
  process.env.SCALER_MULTIPART_FILE_FIELD?.trim() || "files";

/** Base URL for download links in email (recipients need a public host, not localhost). */
function publicAppOrigin(request: Request): string {
  const fromEnv =
    process.env.REPORT_PUBLIC_ORIGIN?.trim() || process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (fromEnv) return fromEnv.replace(/\/$/, "");
  return new URL(request.url).origin;
}

export async function POST(request: Request) {
  const payload = (await request.json().catch(() => ({}))) as SendPayload;
  const requestInternalPass =
    request.headers.get("x-internal-pass")?.trim() ?? "";
  const scalerInternalPass = SCALER_INTERNAL_PASS || requestInternalPass;
  const accountId = payload.filters?.account_id?.trim() ?? "";
  const startDate = payload.filters?.start_date?.trim() ?? "";
  const endDate = payload.filters?.end_date?.trim() ?? "";
  const filters: ReportFilters = {
    account_id: accountId,
    start_date: startDate,
    end_date: endDate,
    deal_owner: payload.filters?.deal_owner?.trim() ?? "",
    enterprise_midmarket: payload.filters?.enterprise_midmarket?.trim() ?? "",
    reply_text: payload.filters?.reply_text?.trim() ?? "",
    month: payload.filters?.month?.trim() ?? "",
  };
  const to = payload.to?.trim() ?? "";
  const rawCc = payload.cc;
  const subject = payload.subject?.trim() ?? "";
  const body = payload.body?.trim() ?? "";
  const forceResend = payload.forceResend === true;
  const simulateDeliveryFailure = payload.simulateDeliveryFailure === true;

  const parsedRecipients = to
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
  const recipients = normalizeRecipients(parsedRecipients);
  const ccRecipients = normalizeRecipients(
    Array.isArray(rawCc)
      ? rawCc
      : typeof rawCc === "string"
        ? rawCc
            .split(",")
            .map((v) => v.trim())
            .filter(Boolean)
        : []
  );
  const validationError = validateSendInput({
    accountId,
    startDate,
    endDate,
    recipients,
    subject,
    body,
  });
  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 });
  }

  const runId = randomUUID();
  try {
    return await executeReportSend({
      request,
      publicOrigin: publicAppOrigin(request),
      runId,
      filters,
      subject,
      body,
      recipients,
      ccRecipients,
      forceResend,
      simulateDeliveryFailure,
      scalerInternalPass,
    });
  } catch (e) {
    console.error("[report-email] failed", e);
    const message =
      e instanceof Error ? e.message : "Failed to generate or send the report email.";
    return NextResponse.json({ error: message, runId }, { status: 500 });
  }
}

type SendContext = {
  request: Request;
  publicOrigin: string;
  runId: string;
  filters: ReportFilters;
  subject: string;
  body: string;
  recipients: string[];
  ccRecipients: string[];
  forceResend: boolean;
  simulateDeliveryFailure: boolean;
  scalerInternalPass: string;
};

async function executeReportSend(ctx: SendContext) {
  const {
    request,
    publicOrigin,
    runId,
    filters,
    recipients,
    ccRecipients,
    subject,
    body,
    forceResend,
    simulateDeliveryFailure,
    scalerInternalPass,
  } = ctx;
  const origin = new URL(request.url).origin;
  const reportRows = await buildMetricsReport(origin, filters);
  const { inlineRows, bigTableRows } = splitInlineAndBigTableRows(reportRows);
  const fileAttachments = buildBigTableExcelAttachments(filters, bigTableRows);
  const emptyAttachments = fileAttachments.filter(
    (a) => !a.contentBase64 || a.contentBase64.length < 50
  );
  if (emptyAttachments.length > 0) {
    console.warn("[report-email] attachment payload looks empty or too small", {
      filenames: emptyAttachments.map((a) => a.filename),
    });
  }
  const attachmentLabels = fileAttachments.map((attachment) => attachment.label);

  const tokenBase = {
    account_id: filters.account_id,
    start_date: filters.start_date,
    end_date: filters.end_date,
    deal_owner: filters.deal_owner,
    enterprise_midmarket: filters.enterprise_midmarket,
    reply_text: filters.reply_text,
    month: filters.month,
  };
  const tTickets = createReportFileDownloadToken({
    ...tokenBase,
    metric_key: "total_tickets_inbox_wise",
  });
  const tProducts = createReportFileDownloadToken({
    ...tokenBase,
    metric_key: "product_card_count",
  });
  const fileDownloadLinks: { label: string; href: string }[] = [];
  if (tTickets) {
    fileDownloadLinks.push({
      label: "Total Tickets Inbox Wise (.xlsx)",
      href: `${publicOrigin}/api/report/file?t=${encodeURIComponent(tTickets)}`,
    });
  }
  if (tProducts) {
    fileDownloadLinks.push({
      label: "Product Card Count (.xlsx)",
      href: `${publicOrigin}/api/report/file?t=${encodeURIComponent(tProducts)}`,
    });
  }

  const renderedHtml = renderEmailHtmlTemplate(
    subject,
    body,
    attachmentLabels,
    inlineRows,
    fileDownloadLinks
  );
  const sender = "team@limechat.ai";
  const dispatch =
    recipients.length === 1
      ? { to: recipients[0], bcc: [] as string[] }
      : { to: sender, bcc: recipients };
  if (simulateDeliveryFailure) {
    const alert = buildTerminalFailureAlert("Delivery failed after retry attempts.");
    return NextResponse.json(
      {
        runId,
        statuses: ["Generating", "Sending", "Failed"],
        message: "Delivery failed after retries. Alert triggered.",
        retryPlan: buildRetryPlan(),
        alert,
        sendAudit: {
          idempotencyKey: null,
          forceResendApplied: forceResend,
          status: "failed",
          providerStatus: "delivery_failed",
        },
      },
      { status: 502 }
    );
  }

  if (!scalerInternalPass) {
    return NextResponse.json(
      {
        error:
          "Email service is not configured. Set SCALER_INTERNAL_PASS in server env or send x-internal-pass header.",
      },
      { status: 500 }
    );
  }

  const attachmentJsonArray = fileAttachments.map(toScalerAttachmentJson);
  const diagnostics = attachmentPayloadDiagnostics(fileAttachments);

  const scalerRequest: RequestInit & { dispatcher?: Agent } = SCALER_SEND_AS_MULTIPART
    ? {
        method: "POST",
        headers: {
          Accept: "application/json",
          "x-internal-pass": scalerInternalPass,
          "account-id": SCALER_ACCOUNT_ID,
        },
        body: buildScalerMultipartFormData({
          dispatch,
          cc: ccRecipients,
          subject,
          htmlBody: renderedHtml,
          attachments: fileAttachments,
          fileFieldName: SCALER_MULTIPART_FILE_FIELD,
        }),
      }
    : {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          "x-internal-pass": scalerInternalPass,
          "account-id": SCALER_ACCOUNT_ID,
        },
        body: JSON.stringify({
          to: [dispatch.to],
          cc: ccRecipients,
          bcc: dispatch.bcc,
          subject,
          body: renderedHtml,
          body_type: "html",
          [SCALER_ATTACHMENTS_JSON_KEY]: attachmentJsonArray,
        }),
      };

  console.log("[report-email] outbound scaler", {
    url: SCALER_SEND_URL,
    format: SCALER_SEND_AS_MULTIPART ? "multipart" : "json",
    attachmentsJsonKey: SCALER_ATTACHMENTS_JSON_KEY,
    fileField: SCALER_SEND_AS_MULTIPART ? SCALER_MULTIPART_FILE_FIELD : undefined,
    dispatch,
    attachmentDiagnostics: diagnostics,
  });

  if (ALLOW_INSECURE_TLS_FOR_SCALER) {
    scalerRequest.dispatcher = new Agent({
      connect: { rejectUnauthorized: false },
    });
  }

  const scalerRes = await fetch(SCALER_SEND_URL, scalerRequest);

  if (scalerRes.status === 429) {
    const errText = await scalerRes.text().catch(() => "");
    let message = "Rate limit exceeded. Try again later.";
    if (errText.trim()) {
      try {
        const data = JSON.parse(errText) as { error?: string };
        if (data.error) message = data.error;
      } catch {
        /* plain-text body */
      }
    }
    return NextResponse.json({ error: message }, { status: 429 });
  }

  if (!scalerRes.ok) {
    const scalerError = await scalerRes.text().catch(() => "");
    return NextResponse.json(
      {
        error: "Failed to send email. Please try again.",
        providerError: scalerError || undefined,
      },
      { status: scalerRes.status }
    );
  }

  const scalerRawBody = await scalerRes.text();
  let scalerData: Record<string, unknown> = {};
  if (scalerRawBody.trim()) {
    try {
      scalerData = JSON.parse(scalerRawBody) as Record<string, unknown>;
    } catch {
      console.warn(
        "[report-email] scaler returned success but non-JSON body",
        scalerRawBody.slice(0, 280)
      );
    }
  }
  const logIdRaw = scalerData.log_id;
  const logId =
    typeof logIdRaw === "number"
      ? logIdRaw
      : typeof logIdRaw === "string" && /^\d+$/.test(logIdRaw)
        ? Number(logIdRaw)
        : null;
  console.log("[report-email] scaler response", scalerData);

  return NextResponse.json({
    runId,
    logId,
    statuses: ["Generating", "Sending", "Sent"],
    message: "Email sent successfully.",
    from: sender,
    recipients,
    dispatchMode: recipients.length === 1 ? "to" : "bcc",
    idempotencyKey: null,
    forceResendApplied: forceResend,
    attachments: fileAttachments.map((attachment) => ({
      filename: attachment.filename,
      label: attachment.label,
    })),
    attachmentDiagnostics: diagnostics,
    sendAudit: {
      idempotencyKey: null,
      forceResendApplied: forceResend,
      status: "sent",
      providerStatus: "accepted",
    },
    providerResponse:
      Object.keys(scalerData).length > 0 ? scalerData : { note: "empty or non-JSON response body" },
  });
}
