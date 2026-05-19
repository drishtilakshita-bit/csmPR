import { NextRequest, NextResponse } from "next/server";
import { getWidgetInfoByLcAccountId } from "@/lib/googleSheetMappings";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const account_id = searchParams.get("account_id") ?? "";

  const lc = account_id.trim();
  if (!lc) {
    return NextResponse.json({ error: "Missing account_id" }, { status: 400 });
  }

  try {
    const info = await getWidgetInfoByLcAccountId(lc);
    return NextResponse.json({
      widgetPresentByLc: info?.widgetPresentByLc ?? "No",
      widgetType: info?.widgetType ?? "",
    });
  } catch {
    // Do not break widget UI if sheet fetch is temporarily unavailable.
    return NextResponse.json({
      widgetPresentByLc: "No",
      widgetType: "",
    });
  }
}

