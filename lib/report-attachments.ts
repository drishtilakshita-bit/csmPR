import type { ReportFilters, ReportRow } from "@/lib/report";

export type ReportAttachment = {
  label: string;
  filename: string;
  mimeType: string;
  contentBase64: string;
};

function formatDateForFilename(date: string): string {
  const [year, month, day] = date.split("-");
  if (!year || !month || !day) return date;
  return `${day}-${month}-${year}`;
}

export function buildPdfFilename(filters: ReportFilters): string {
  return `${filters.account_id}_metrics_${formatDateForFilename(
    filters.start_date
  )}_${formatDateForFilename(filters.end_date)}.pdf`;
}

export function buildPdfAttachment(
  filters: ReportFilters,
  sourceContent: string
): ReportAttachment {
  // Placeholder PDF payload for v1 slice scaffolding.
  const contentBase64 = Buffer.from(sourceContent, "utf8").toString("base64");
  return {
    label: "Metrics PDF",
    filename: buildPdfFilename(filters),
    mimeType: "application/pdf",
    contentBase64,
  };
}

export function buildProductCardCountCsvFilename(filters: ReportFilters): string {
  return `${filters.account_id}_product_card_count_${formatDateForFilename(
    filters.start_date
  )}_${formatDateForFilename(filters.end_date)}.csv`;
}

function escapeCsvCell(value: string): string {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

function normalizeHeaderName(header: string): string {
  return header.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function extractProductCardCountRows(reportRows: ReportRow[]): Array<{
  productName: string;
  cardCount: number;
}> {
  const row = reportRows.find((reportRow) => reportRow.metricKey === "product_card_count");
  if (!row?.rows?.length) return [];

  const cols = row.cols ?? [];
  const productIdx = cols.findIndex((col) => {
    const normalized = normalizeHeaderName(col);
    return normalized.includes("product") && normalized.includes("name");
  });
  const countIdx = cols.findIndex((col) => normalizeHeaderName(col).includes("count"));

  const safeProductIdx = productIdx >= 0 ? productIdx : 0;
  const safeCountIdx = countIdx >= 0 ? countIdx : 1;

  return row.rows
    .map((cells) => {
      const productName = String(cells[safeProductIdx] ?? "").trim();
      const countRaw = String(cells[safeCountIdx] ?? "").trim().replace(/,/g, "");
      const cardCount = Number(countRaw);
      return { productName, cardCount };
    })
    .filter((entry) => entry.productName && Number.isFinite(entry.cardCount))
    .sort((a, b) => b.cardCount - a.cardCount);
}

export function buildProductCardCountCsvAttachment(
  filters: ReportFilters,
  reportRows: ReportRow[]
): ReportAttachment | null {
  const extractedRows = extractProductCardCountRows(reportRows);
  if (extractedRows.length === 0) return null;

  const csvLines = [
    `"product_name","card_count"`,
    ...extractedRows.map(
      (entry) => `${escapeCsvCell(entry.productName)},${escapeCsvCell(String(entry.cardCount))}`
    ),
  ];

  return {
    label: "Product Card Count CSV",
    filename: buildProductCardCountCsvFilename(filters),
    mimeType: "text/csv",
    contentBase64: Buffer.from(csvLines.join("\n") + "\n", "utf8").toString("base64"),
  };
}
