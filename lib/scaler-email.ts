import type { ReportAttachment } from "@/lib/report-attachments";

/**
 * LimeChat Scaler `/api/v1/send/` JSON attachments.
 * Keep payload lean: `content` + `content_base64` only (some backends read one or the other).
 */
export function toScalerAttachmentJson(a: ReportAttachment): Record<string, string> {
  const b64 = a.contentBase64?.trim() ?? "";
  return {
    filename: a.filename,
    file_name: a.filename,
    mime_type: a.mimeType,
    mimetype: a.mimeType,
    content_base64: b64,
    content: b64,
  };
}

/** Same filenames but byte counts for debugging missing attachments in the mail client. */
export function attachmentPayloadDiagnostics(attachments: ReportAttachment[]) {
  return attachments.map((a) => {
    let decodedBytes = 0;
    try {
      decodedBytes = Buffer.from(a.contentBase64?.trim() ?? "", "base64").length;
    } catch {
      decodedBytes = 0;
    }
    return {
      filename: a.filename,
      label: a.label,
      base64Characters: (a.contentBase64 ?? "").length,
      decodedBytes,
    };
  });
}

/**
 * Some Django deployments accept binary parts (request.FILES) instead of JSON base64.
 * Field names are best guesses — set SCALER_MULTIPART_FILE_FIELD / SCALER_MULTIPART_META_FIELD
 * to match your Scaler API.
 */
export function buildScalerMultipartFormData(opts: {
  dispatch: { to: string; bcc: string[] };
  cc: string[];
  subject: string;
  htmlBody: string;
  attachments: ReportAttachment[];
  /** Defaults: SCALER_MULTIPART_FILE_FIELD or "files" */
  fileFieldName: string;
}): FormData {
  const fd = new FormData();
  fd.append("subject", opts.subject);
  fd.append("body", opts.htmlBody);
  fd.append("body_type", "html");
  fd.append("to", JSON.stringify([opts.dispatch.to]));
  fd.append("bcc", JSON.stringify(opts.dispatch.bcc));
  fd.append("cc", JSON.stringify(opts.cc));
  for (const a of opts.attachments) {
    const buf = Buffer.from(a.contentBase64?.trim() ?? "", "base64");
    const blob = new Blob([buf], { type: a.mimeType });
    fd.append(opts.fileFieldName, blob, a.filename);
  }
  return fd;
}
