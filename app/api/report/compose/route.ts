import { NextRequest, NextResponse } from "next/server";
import {
  buildDefaultEmailBody,
  buildDefaultEmailSubject,
} from "@/lib/email-composition";
import { buildMetricsReport, type ReportFilters } from "@/lib/report";

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const filters: ReportFilters = {
    account_id: sp.get("account_id") ?? "",
    start_date: sp.get("start_date") ?? "",
    end_date: sp.get("end_date") ?? "",
    deal_owner: sp.get("deal_owner") ?? "",
    enterprise_midmarket: sp.get("enterprise_midmarket") ?? "",
    reply_text: sp.get("reply_text") ?? "",
    month: sp.get("month") ?? "",
  };

  if (!filters.account_id || !filters.start_date || !filters.end_date) {
    return NextResponse.json(
      { error: "account_id, start_date and end_date are required" },
      { status: 400 }
    );
  }

  const origin = request.nextUrl.origin;
  const rows = await buildMetricsReport(origin, filters);

  return NextResponse.json({
    subject: buildDefaultEmailSubject(filters),
    body: buildDefaultEmailBody(filters, rows),
  });
}
