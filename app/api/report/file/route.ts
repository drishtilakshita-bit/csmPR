import { NextResponse } from "next/server";
import { buildMetricsReport } from "@/lib/report";
import { buildExcelAttachmentForMetricKey } from "@/lib/report-email-packaging";
import type { ReportFilters } from "@/lib/report";
import { verifyReportFileDownloadToken } from "@/lib/report-file-token";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const token = url.searchParams.get("t")?.trim();
  if (!token) {
    return NextResponse.json({ error: "Missing t (token) query parameter." }, { status: 400 });
  }

  const payload = verifyReportFileDownloadToken(token);
  if (!payload) {
    return NextResponse.json(
      { error: "Invalid or expired download link." },
      { status: 401 }
    );
  }

  const filters: ReportFilters = {
    account_id: payload.account_id,
    start_date: payload.start_date,
    end_date: payload.end_date,
    deal_owner: payload.deal_owner ?? "",
    enterprise_midmarket: payload.enterprise_midmarket ?? "",
    reply_text: payload.reply_text ?? "",
    month: payload.month ?? "",
  };

  const origin = new URL(request.url).origin;
  const reportRows = await buildMetricsReport(origin, filters);
  const att = buildExcelAttachmentForMetricKey(
    filters,
    payload.metric_key,
    reportRows
  );
  if (!att?.contentBase64) {
    return NextResponse.json({ error: "Could not build spreadsheet." }, { status: 500 });
  }

  const buf = Buffer.from(att.contentBase64, "base64");
  return new NextResponse(buf, {
    status: 200,
    headers: {
      "Content-Type": att.mimeType,
      "Content-Disposition": `attachment; filename="${att.filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
