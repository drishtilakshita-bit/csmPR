import type { ReportAttachment } from "@/lib/report-attachments";

export type RetryPlan = {
  retryDelaysMinutes: number[];
  attempts: Array<{ attempt: number; delayMinutes: number }>;
};

export type AlertSignal = {
  channels: Array<"slack" | "email" | "dashboard">;
  reason: string;
};

export type FollowUpAttachmentPlan = {
  scheduledWithinHours: number;
  subject: string;
  note: string;
  missingAttachments: ReportAttachment[];
};

export function buildRetryPlan(): RetryPlan {
  const retryDelaysMinutes = [1, 5, 15];
  return {
    retryDelaysMinutes,
    attempts: retryDelaysMinutes.map((delayMinutes, idx) => ({
      attempt: idx + 1,
      delayMinutes,
    })),
  };
}

export function buildTerminalFailureAlert(reason: string): AlertSignal {
  return {
    channels: ["slack", "email", "dashboard"],
    reason,
  };
}

export function buildFollowUpAttachmentPlan(input: {
  originalSubject: string;
  missingAttachments: ReportAttachment[];
}): FollowUpAttachmentPlan {
  return {
    scheduledWithinHours: 24,
    subject: `Follow-up attachment: ${input.originalSubject}`,
    note: "Following up with the missing attachment from the previous send.",
    missingAttachments: input.missingAttachments,
  };
}
