"use client";

import { useEffect, useState } from "react";
import type { DraftApprovalHistoryRow, DraftStatus } from "@/lib/supabase/database.types";

const labels: Record<DraftStatus, string> = { draft: "초안", pending: "승인 대기", approved: "승인됨" };

export function DraftApprovalHistory({ workspaceId, draftId, actorName }: {
  workspaceId: string; draftId: string; actorName: (id: string) => string;
}) {
  const [history, setHistory] = useState<DraftApprovalHistoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const response = await fetch("/api/workspaces/" + workspaceId + "/drafts/" + draftId + "/history", {
          cache: "no-store", credentials: "same-origin",
          signal: AbortSignal.any([controller.signal, AbortSignal.timeout(20000)]),
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error ?? "승인 이력을 불러오지 못했습니다.");
        if (!controller.signal.aborted) setHistory(result.history);
      } catch (failure) {
        if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : "승인 이력을 불러오지 못했습니다.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void load();
    return () => controller.abort();
  }, [workspaceId, draftId]);

  const formatter = new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul", year: "numeric", month: "numeric", day: "numeric",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  });

  return (
    <section className="draft-approval-history" aria-label="승인 이력">
      <h3>승인 이력 <span className="count-pill">{history.length}</span></h3>
      {loading && <p role="status">이력을 불러오는 중…</p>}
      {error && <p className="auth-error" role="alert">{error}</p>}
      {!loading && !error && !history.length && <p>아직 상태 변경 이력이 없습니다.</p>}
      <ol aria-label="시간순 승인 이력">
        {history.map((entry) => (
          <li key={entry.id}>
            <strong>{labels[entry.from_status]} → {labels[entry.to_status]}</strong>
            <div>{actorName(entry.actor_user_id)} · <time dateTime={entry.created_at}>{formatter.format(new Date(entry.created_at))} KST</time></div>
            {entry.note && <p className="approval-note">{entry.note}</p>}
          </li>
        ))}
      </ol>
    </section>
  );
}
