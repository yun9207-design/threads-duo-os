import type { DraftStatus } from "./supabase/database.types";

export class DraftInputError extends Error {}

export function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

function objectInput(value: unknown, allowed: string[]) {
  if (!value || typeof value !== "object" || Array.isArray(value)
    || Object.keys(value).some((key) => !allowed.includes(key))) {
    throw new DraftInputError("허용되지 않은 초안 입력입니다.");
  }
  return value as Record<string, unknown>;
}

function textInput(value: unknown, name: string, max: number, required = false) {
  if (typeof value !== "string" || value.includes("\0")
    || Array.from(value).length > max || (required && !value.trim())) {
    throw new DraftInputError(`${name} 입력을 확인해 주세요. 최대 ${max}자입니다.`);
  }
  return required ? value.trim() : value;
}

export function parseDraftInput(value: unknown, update: true): DraftContent & { expectedUpdatedAt: string };
export function parseDraftInput(value: unknown, update?: false): DraftContent;
export function parseDraftInput(value: unknown, update = false) {
  const input = objectInput(value, update ? ["topic", "body", "status", "expectedUpdatedAt"] : ["topic", "body", "status"]);
  if (!["draft", "pending", "approved"].includes(input.status as string)) {
    throw new DraftInputError("초안 상태를 확인해 주세요.");
  }
  const content = {
    topic: textInput(input.topic, "주제", 200, true),
    body: textInput(input.body, "본문", 5000),
    status: input.status as DraftStatus,
  };
  return update ? { ...content, expectedUpdatedAt: parseVersion(input.expectedUpdatedAt) } : content;
}

export type DraftContent = { topic: string; body: string; status: DraftStatus };

function parseVersion(value: unknown) {
  if (typeof value !== "string" || value.length > 40
    || !/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value)
    || Number.isNaN(Date.parse(value))) {
    throw new DraftInputError("초안 버전을 확인할 수 없습니다. 목록을 다시 불러와 주세요.");
  }
  return value;
}

export function parseDeleteInput(value: unknown) {
  return parseVersion(objectInput(value, ["expectedUpdatedAt"]).expectedUpdatedAt);
}
