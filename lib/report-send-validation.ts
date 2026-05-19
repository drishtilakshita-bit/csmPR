export type SendValidationInput = {
  accountId: string;
  startDate: string;
  endDate: string;
  recipients: string[];
  subject: string;
  body: string;
};

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function parseIstDate(date: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const parsed = new Date(`${date}T00:00:00+05:30`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function validateSendInput(input: SendValidationInput): string | null {
  if (!input.accountId || !input.startDate || !input.endDate) {
    return "account_id, start_date and end_date are required.";
  }

  const start = parseIstDate(input.startDate);
  const end = parseIstDate(input.endDate);
  if (!start || !end) {
    return "Dates must be valid and in yyyy-mm-dd format.";
  }

  if (start.getTime() > end.getTime()) {
    return "start_date must be less than or equal to end_date.";
  }

  if (!input.subject.trim() || !input.body.trim()) {
    return "Subject and body are required for send.";
  }

  if (input.recipients.length === 0) {
    return "At least one recipient is required.";
  }
  if (input.recipients.length > 5) {
    return "You can send to at most 5 recipients.";
  }

  for (const recipient of input.recipients) {
    if (!EMAIL_REGEX.test(recipient)) {
      return `Invalid recipient email: ${recipient}`;
    }
  }

  return null;
}

export function normalizeRecipients(recipients: string[]): string[] {
  const deduped = new Set<string>();
  for (const recipient of recipients) {
    const normalized = recipient.trim().toLowerCase();
    if (normalized) deduped.add(normalized);
  }
  return Array.from(deduped);
}
