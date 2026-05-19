const SHEET_TTL_MS = 15 * 60 * 1000; // 15 minutes

type WidgetInfo = { widgetPresentByLc: string; widgetType: string };

type TsvMapping = {
  fetchedAt: number;
  widgetByLc?: Map<string, WidgetInfo>;
  hdByLc?: Map<string, string>;
};

let cache: TsvMapping | null = null;

function normalizeHeader(s: string) {
  return s.trim().toLowerCase().replace(/\s+/g, "_");
}

function normalizeAccountId(raw: string) {
  const v = String(raw ?? "")
    .trim()
    .replace(/^'+/, "")
    .replace(/,/g, "");
  if (!v) return "";
  // Handles values like "27504", "27504.0", " 27504 ", etc.
  const numeric = Number(v);
  if (Number.isFinite(numeric) && !Number.isNaN(numeric)) {
    return String(Math.trunc(numeric));
  }
  return v.replace(/\s+/g, "").replace(/[^\w-]/g, "");
}

function parseTsv(text: string): string[][] {
  // Google TSV export is simple; split by newline + tab.
  const lines = text.split(/\r?\n/).map((l) => l.trimEnd());
  return lines
    .filter((l) => l.length > 0)
    .map((l) => l.split("\t"));
}

async function fetchSheetTsv(sheetId: string, gid = 0) {
  // Try export endpoint first; fallback to gviz for compatibility.
  const exportUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=tsv&gid=${gid}`;
  const exportRes = await fetch(exportUrl, { cache: "no-store" });
  if (exportRes.ok) {
    const text = await exportRes.text();
    // Sometimes Google returns an HTML error page with 200 status.
    if (!text.trimStart().startsWith("<!DOCTYPE html")) {
      return text;
    }
  }

  const gvizUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:tsv&gid=${gid}`;
  const gvizRes = await fetch(gvizUrl, { cache: "no-store" });
  if (!gvizRes.ok) {
    throw new Error(
      `Failed to fetch sheet TSV ${sheetId} (gid=${gid}) - export:${exportRes.status} gviz:${gvizRes.status}`
    );
  }
  const gvizText = await gvizRes.text();
  // gviz endpoint may return JS wrapper instead of plain TSV.
  const marker = "google.visualization.Query.setResponse(";
  if (!gvizText.includes(marker)) {
    return gvizText;
  }
  const start = gvizText.indexOf(marker) + marker.length;
  const end = gvizText.lastIndexOf(");");
  if (end <= start) return gvizText;
  try {
    const payload = JSON.parse(gvizText.slice(start, end)) as {
      table?: {
        cols?: Array<{ id?: string; label?: string }>;
        rows?: Array<{ c?: Array<{ v?: unknown; f?: string } | null> }>;
      };
    };
    const cols = payload.table?.cols ?? [];
    const rows = payload.table?.rows ?? [];
    const header = cols.map((c, i) => String(c.label ?? c.id ?? `col_${i + 1}`));
    const body = rows.map((r) =>
      cols.map((_, i) => {
        const cell = r.c?.[i];
        if (!cell) return "";
        return String(cell.f ?? cell.v ?? "");
      })
    );
    return [header, ...body].map((r) => r.join("\t")).join("\n");
  } catch {
    return gvizText;
  }
}

async function ensureCacheLoaded() {
  const now = Date.now();
  if (cache && now - cache.fetchedAt < SHEET_TTL_MS) return;

  // Sheet 1: Widget mapping
  // Columns (as per your sheet):
  //   B: LC Account ID
  //   D: Widget Present by LC (Yes/No)
  //   E: Widget Type
  const WIDGET_SHEET_ID = "1t6A7Z-dRTEkLQWd6gYnRuu0iOnwCRjRKU7g_BUJfRic";

  // Sheet 2: LC -> hd mapping
  //   I: hd_account_id
  //   J: LC Account ID
  const HD_MAP_SHEET_ID = "1FcftpvzbPRmdBr34WU_cBVPDv3Dkn8G95VnWg5SVztc";

  const [widgetTsv, hdTsv] = await Promise.all([
    fetchSheetTsv(WIDGET_SHEET_ID, 0),
    fetchSheetTsv(HD_MAP_SHEET_ID, 0),
  ]);

  const widgetRows = parseTsv(widgetTsv);
  const hdRows = parseTsv(hdTsv);

  const widgetByLc = new Map<string, WidgetInfo>();
  if (widgetRows.length > 1) {
    const header = widgetRows[0].map(normalizeHeader);
    const lcIdx = header.findIndex((h) => h === "lc_account_id" || h.includes("lc_account_id"));
    const presentIdx = header.findIndex((h) => h.includes("widget_present") || h.includes("widget_present_by_lc"));
    const typeIdx = header.findIndex((h) => h.includes("widget_type"));

    // Fallback to expected indices: B=1, D=3, E=4 (0-based)
    const lcFallback = 1;
    const presentFallback = 3;
    const typeFallback = 4;

    for (let i = 1; i < widgetRows.length; i++) {
      const cols = widgetRows[i];
      const lcRaw = String(cols[lcIdx >= 0 ? lcIdx : lcFallback] ?? "").trim();
      const lc = normalizeAccountId(lcRaw);
      if (!lc) continue;
      const present = String(cols[presentIdx >= 0 ? presentIdx : presentFallback] ?? "").trim();
      const type = String(cols[typeIdx >= 0 ? typeIdx : typeFallback] ?? "").trim();
      if (!widgetByLc.has(lc)) {
        widgetByLc.set(lc, {
          widgetPresentByLc: present || "No",
          widgetType: type || "",
        });
      }
    }
  }

  const hdByLc = new Map<string, string>();
  if (hdRows.length > 1) {
    const header = hdRows[0].map(normalizeHeader);
    const hdIdx = header.findIndex((h) => h === "hd_account_id" || h.includes("hd_account_id"));
    const lcIdx = header.findIndex((h) => h === "lc_account_id" || h.includes("lc_account_id"));

    // Fallback to expected indices: I=8 (hd), J=9 (lc) (0-based)
    const hdFallback = 8;
    const lcFallback = 9;

    for (let i = 1; i < hdRows.length; i++) {
      const cols = hdRows[i];
      const lcRaw = String(cols[lcIdx >= 0 ? lcIdx : lcFallback] ?? "").trim();
      const lc = normalizeAccountId(lcRaw);
      const hd = normalizeAccountId(String(cols[hdIdx >= 0 ? hdIdx : hdFallback] ?? "").trim());
      if (!lc) continue;
      if (hd) hdByLc.set(lc, hd);
    }
  }

  cache = {
    fetchedAt: now,
    widgetByLc,
    hdByLc,
  };
}

export async function getWidgetInfoByLcAccountId(lcAccountId: string): Promise<WidgetInfo | null> {
  const lc = normalizeAccountId(String(lcAccountId ?? "").trim());
  if (!lc) return null;
  try {
    await ensureCacheLoaded();
    return cache?.widgetByLc?.get(lc) ?? null;
  } catch {
    // If sheets are not publicly accessible, fail gracefully.
    return null;
  }
}

export async function mapLcAccountIdToHdAccountId(lcAccountId: string): Promise<string | null> {
  const lc = normalizeAccountId(String(lcAccountId ?? "").trim());
  if (!lc) return null;
  try {
    await ensureCacheLoaded();
    return cache?.hdByLc?.get(lc) ?? null;
  } catch {
    // If sheets are not publicly accessible, fail gracefully.
    return null;
  }
}

