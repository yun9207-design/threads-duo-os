import { DraftInputError, parseDeleteInput } from "./drafts-validation";
import type { DraftRow } from "./supabase/database.types";

export function parseScheduleInput(value: unknown, now = Date.now()) {
  if (!value || typeof value !== "object" || Array.isArray(value)
    || Object.keys(value).some((key) => !["scheduledAt", "expectedUpdatedAt"].includes(key))) {
    throw new DraftInputError("예약 입력을 확인해 주세요.");
  }
  const input = value as Record<string, unknown>;
  const expectedUpdatedAt = parseDeleteInput({ expectedUpdatedAt: input.expectedUpdatedAt });
  if (input.scheduledAt === null) return { scheduledAt: null, expectedUpdatedAt };
  if (typeof input.scheduledAt !== "string"
    || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/.test(input.scheduledAt)
    || !Number.isFinite(Date.parse(input.scheduledAt)) || Date.parse(input.scheduledAt) <= now
    || new Date(input.scheduledAt.slice(0, 19) + "Z").toISOString().slice(0, 19) !== input.scheduledAt.slice(0, 19)) {
    throw new DraftInputError("예약시간은 현재보다 미래의 날짜와 시간으로 지정해 주세요.");
  }
  return { scheduledAt: new Date(input.scheduledAt).toISOString(), expectedUpdatedAt };
}

// The UI always means Korea time, regardless of the browser's local timezone.
export function kstInput(value: string) {
  return new Date(Date.parse(value) + 9 * 60 * 60 * 1000).toISOString().slice(0, 16);
}

export function kstInputToIso(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) {
    throw new DraftInputError("예약시간을 입력해 주세요.");
  }
  const date = new Date(value + ":00+09:00");
  if (!Number.isFinite(date.getTime()) || kstInput(date.toISOString()) !== value) {
    throw new DraftInputError("유효한 예약 날짜와 시간을 입력해 주세요.");
  }
  return date.toISOString();
}

export function scheduledDate(value: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul", year: "numeric", month: "numeric", day: "numeric",
    hour: "2-digit", minute: "2-digit", hour12: false,
  }).format(new Date(value));
}

export function scheduleSummary(drafts: DraftRow[], referenceTime: string) {
  const today = kstInput(referenceTime).slice(0, 10);
  const scheduled = drafts.filter((draft) => draft.status === "approved" && !draft.deleted_at && draft.scheduled_at
    && draft.publication_status === "unpublished")
    .sort((a, b) => Date.parse(a.scheduled_at!) - Date.parse(b.scheduled_at!) || a.id.localeCompare(b.id));
  return {
    scheduled,
    today: scheduled.filter((draft) => kstInput(draft.scheduled_at!).slice(0, 10) === today).length,
    upcoming: scheduled.filter((draft) => kstInput(draft.scheduled_at!).slice(0, 10) > today).length,
  };
}
