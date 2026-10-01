"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Icon } from "@/components/icon";
import { SessionControls } from "@/components/session-controls";
import { DraftApprovalHistory } from "@/components/draft-approval-history";
import type { DraftWorkspace } from "@/lib/drafts";
import type { DraftRow, DraftStatus } from "@/lib/supabase/database.types";
import { kstInput, kstInputToIso, scheduledDate, scheduleSummary } from "@/lib/draft-scheduling";

const statusLabels: Record<DraftStatus, string> = { draft: "초안", pending: "승인 대기", approved: "승인됨" };
type Filter = "all" | DraftStatus;

function savedDate(value: string) {
  return new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric" }).format(new Date(value));
}

export function TodayDashboard({ userEmail, workspace, initialDrafts, loadError, referenceTime }: {
  userEmail: string; workspace: DraftWorkspace | null; initialDrafts: DraftRow[]; loadError: string;
  referenceTime: string;
}) {
  const [drafts, setDrafts] = useState(initialDrafts);
  const [filter, setFilter] = useState<Filter>("all");
  const [editing, setEditing] = useState<DraftRow | null>(null);
  const [topic, setTopic] = useState("");
  const [body, setBody] = useState("");
  const [status, setStatus] = useState<DraftStatus>("draft");
  const [approvalNote, setApprovalNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(loadError);
  const [notice, setNotice] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [scheduleTime, setScheduleTime] = useState("");
  const [scheduleClock, setScheduleClock] = useState(referenceTime);
  useEffect(() => {
    const timer = setInterval(() => setScheduleClock(new Date().toISOString()), 30000);
    return () => clearInterval(timer);
  }, []);
  const workspaceName = workspace?.workspace.name ?? "워크스페이스";
  const baseUrl = workspace ? "/api/workspaces/" + workspace.workspace.id + "/drafts" : "";
  const visibleDrafts = drafts.filter((draft) => filter === "all" || draft.status === filter);
  const counts = {
    all: drafts.length,
    draft: drafts.filter((draft) => draft.status === "draft").length,
    pending: drafts.filter((draft) => draft.status === "pending").length,
    approved: drafts.filter((draft) => draft.status === "approved").length,
  };
  const authorName = (id: string) => workspace?.members.find((member) => member.profile_id === id)?.profiles?.display_name ?? "워크스페이스 멤버";
  const schedule = scheduleSummary(drafts, scheduleClock);
  const unsavedChanges = editing && (topic !== editing.topic || body !== editing.body || status !== editing.status);

  function openDraft(draft: DraftRow | null) {
    setEditing(draft);
    setTopic(draft?.topic ?? "");
    setBody(draft?.body ?? "");
    setStatus(draft?.status ?? "draft");
    setApprovalNote("");
    setScheduleTime(draft?.scheduled_at ? kstInput(draft.scheduled_at) : "");
    setConfirmDelete(false);
    setNotice("");
    if (!loadError) setError("");
  }

  async function request(path: string, method = "GET", payload?: unknown) {
    const response = await fetch(path, {
      method, cache: "no-store", credentials: "same-origin",
      ...(payload === undefined ? {} : {
        headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
      }),
      signal: AbortSignal.timeout(20000),
    });
    const result = await response.json();
    if (!response.ok) {
      throw new Error(result.error ?? "요청을 처리하지 못했습니다.");
    }
    return result;
  }

  async function reloadDrafts() {
    const result: { drafts: DraftRow[] } = await request(baseUrl);
    setDrafts(result.drafts);
    return result.drafts;
  }

  async function refreshList() {
    if (busy || !workspace) return;
    setBusy(true); setError(""); setNotice("");
    try {
      await reloadDrafts();
      setNotice("저장된 목록을 다시 불러왔습니다.");
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "목록을 불러오지 못했습니다.");
    } finally { setBusy(false); }
  }

  async function saveDraft(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !workspace) return;
    setBusy(true); setError(""); setNotice("");
    let saved = false;
    try {
      const result: { draft: DraftRow } = await request(
        editing ? baseUrl + "/" + editing.id : baseUrl, editing ? "PATCH" : "POST",
        { topic, body, status, ...(editing ? {
          expectedUpdatedAt: editing.updated_at, approvalNote: status !== editing.status ? approvalNote : "",
        } : {}) },
      );
      // A successful DB response becomes the editor's next concurrency version.
      setEditing(result.draft); setTopic(result.draft.topic); setBody(result.draft.body);
      setStatus(result.draft.status); setApprovalNote("");
      setScheduleTime(result.draft.scheduled_at ? kstInput(result.draft.scheduled_at) : "");
      setConfirmDelete(false); saved = true;
      await reloadDrafts();
      setNotice("글이 저장되었습니다.");
    } catch (failure) {
      const message = failure instanceof Error ? failure.message : "저장하지 못했습니다.";
      setError(saved ? "글은 저장됐지만 목록을 갱신하지 못했습니다. 목록 새로고침을 눌러 주세요." : message);
    } finally { setBusy(false); }
  }

  async function deleteDraft() {
    if (busy || !editing || !workspace) return;
    setBusy(true); setError(""); setNotice("");
    let deleted = false;
    try {
      await request(baseUrl + "/" + editing.id, "DELETE", { expectedUpdatedAt: editing.updated_at });
      openDraft(null); deleted = true;
      await reloadDrafts();
      setNotice("글이 삭제되었습니다.");
    } catch (failure) {
      setError(deleted ? "글은 삭제됐지만 목록을 갱신하지 못했습니다. 목록 새로고침을 눌러 주세요."
        : failure instanceof Error ? failure.message : "삭제하지 못했습니다.");
    } finally { setBusy(false); }
  }

  async function saveSchedule(cancel = false) {
    if (busy || !editing || !workspace || unsavedChanges) return;
    setBusy(true); setError(""); setNotice("");
    let saved = false;
    try {
      const scheduledAt = cancel ? null : kstInputToIso(scheduleTime);
      const result: { draft: DraftRow } = await request(baseUrl + "/" + editing.id + "/schedule", "PATCH", {
        scheduledAt, expectedUpdatedAt: editing.updated_at,
      });
      setEditing(result.draft);
      setScheduleTime(result.draft.scheduled_at ? kstInput(result.draft.scheduled_at) : "");
      saved = true;
      await reloadDrafts();
      setNotice(cancel ? "예약이 취소되었습니다." : "예약시간이 저장되었습니다.");
    } catch (failure) {
      setError(saved ? "예약은 저장됐지만 목록을 갱신하지 못했습니다. 목록 새로고침을 눌러 주세요."
        : failure instanceof Error ? failure.message : "예약을 저장하지 못했습니다.");
    } finally { setBusy(false); }
  }

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main">본문으로 건너뛰기</a>
      <aside className="sidebar">
        <a className="brand" href="#today" aria-label="threads duo Today">
          <span className="brand-mark"><i /><i /></span>
          <span>threads duo<span className="brand-sub">OUR CONTENT, IN SYNC.</span></span>
        </a>
        <div className="workspace">
          <span className="workspace-symbol">duo</span>
          <div><strong>{workspaceName}</strong><span>{workspace ? workspace.role + " · 함께 만드는 글" : "연결 확인 필요"}</span></div>
          <span className="workspace-badge">{workspace?.members.length ?? 0}명</span>
        </div>
        <span className="nav-caption">WORKSPACE</span>
        <nav className="primary-nav" aria-label="워크스페이스 메뉴">
          <a className="nav-item active" href="#today"><Icon name="grid" /><span>Today</span><i className="active-dot" /></a>
          <a className="nav-item" href="#studio"><Icon name="pen" /><span>글 작성</span></a>
          <a className="nav-item" href="#drafts"><Icon name="review" /><span>글 목록</span><span className="nav-count">{counts.all}</span></a>
          <a className="nav-item" href="#review"><Icon name="check" /><span>승인 대기</span><span className="nav-count">{counts.pending}</span></a>
          <a className="nav-item" href="#schedule"><Icon name="clock" /><span>예약된 글</span><span className="nav-count">{schedule.scheduled.length}</span></a>
        </nav>
        <div className="sidebar-bottom">
          <div className="demo-note"><span className="status-dot" />함께 만드는 작은 실험<p>두 사람의 아이디어를<br />한곳에 차곡차곡 쌓아보세요.</p></div>
          <a className="nav-item plan-link" href="/MASTER_PLAN.html" target="_blank" rel="noreferrer"><Icon name="book" /><span>프로젝트 마스터플랜</span><Icon name="arrow" size={16} /></a>
          <div className="sidebar-profile"><span className="avatar user-avatar">{userEmail[0]?.toUpperCase()}</span><div><strong className="profile-email" title={userEmail}>{userEmail}</strong><span>로그인 사용자</span></div></div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb"><span>Workspace</span><i>/</i><strong>Today</strong></div>
          <div className="topbar-right"><span className="mock-badge"><span />{loadError ? "연결 확인 필요" : "Live drafts"}</span><span className="topbar-workspace">{workspaceName}</span></div>
        </header>
        <SessionControls email={userEmail} />
        <main id="main">
          <section className="page-heading" id="today">
            <div><div className="eyebrow"><Icon name="sparkle" size={17} /> YOUR DAY, IN SYNC</div><h1>Today Dashboard<span className="heading-dot">.</span></h1><p>오늘의 아이디어, 두 사람의 다음 한 걸음을 한눈에.</p></div>
            <a className="button primary" href="#studio" onClick={() => { if (!busy) openDraft(null); }}><Icon name="plus" size={17} /> 새 글 작성</a>
          </section>
          <div className="day-toolbar"><span>{workspaceName} · {workspace?.role ?? "접근 확인 필요"}</span><span>저장된 글 기준 · KST</span></div>
          <section className="stats-grid" aria-label="저장된 글 요약">
            {([
              ["all", "전체 글", "pen", "전체 저장된 글"],
              ["draft", "초안", "calendar", "함께 다듬는 아이디어"],
              ["pending", "승인 대기", "review", "서로의 확인을 기다려요"],
              ["approved", "승인됨", "check", "게시 전 준비된 글"],
            ] as const).map(([key, label, icon, caption]) => (
              <article className="stat-card" key={key}><div className="stat-top"><span>{label}</span><span className={"stat-icon " + ({ all: "neutral", draft: "orange", pending: "violet", approved: "green" })[key]}><Icon name={icon} size={19} /></span></div>
                <div className="stat-value">{counts[key]}<span>건</span></div><p>{caption}</p>
              </article>
            ))}
          </section>
          <section className="stats-grid schedule-stats" aria-label="저장된 예약 요약">
            {([["today", "오늘 예약", "한국 시간 오늘에 지정된 예약"],
              ["upcoming", "다가오는 예약", "한국 시간 내일 이후의 예약"]] as const).map(([key, label, caption]) => (
              <article className="stat-card" key={key}>
                <div className="stat-top"><span>{label}</span><span className="stat-icon orange"><Icon name="clock" size={19} /></span></div>
                <div className="stat-value">{schedule[key]}<span>건</span></div><p>{caption}</p>
              </article>
            ))}
          </section>
          <div className="drafts-feedback">
            {error && <p className="auth-error" role="alert">{error}</p>}
            {notice && <p className="notice" role="status">{notice}</p>}
          </div>
          <div className="content-grid drafts-grid">
            <section className="panel" id="drafts" aria-label="글 목록">
              <div className="panel-heading"><div><span className="section-kicker">OUR WORDS, TOGETHER</span><h2>우리의 글 <span className="count-pill">{counts.all}</span></h2></div>
                <button className="text-button" type="button" disabled={busy || !workspace} onClick={refreshList}>목록 새로고침 <Icon name="arrow" size={13} /></button>
              </div>
              <div className="queue-tabs" aria-label="글 상태 필터">
                {(["all", "draft", "pending", "approved"] as const).map((key) => (
                  <button type="button" key={key} className={filter === key ? "selected" : ""} onClick={() => setFilter(key)} aria-pressed={filter === key}>
                    {key === "all" ? "전체" : statusLabels[key]}<span>{counts[key]}</span>
                  </button>
                ))}
              </div>
              <div className="queue-table-heading"><span>작성일 / 작성자</span><span>주제 / 본문</span><span>상태</span></div>
              {visibleDrafts.map((draft) => (
                <button type="button" className={"queue-row draft-row" + (editing?.id === draft.id ? " selected" : "")} key={draft.id}
                  disabled={busy} onClick={() => openDraft(draft)} aria-label={draft.topic + " 수정"}>
                  <div className="queue-time"><strong>{savedDate(draft.created_at)}</strong><span>{authorName(draft.author_profile_id)}</span></div>
                  <div className="queue-content"><h3>{draft.topic}</h3><span className="draft-body-preview">{draft.body || "본문을 채워보세요."}</span></div>
                  <span className={"post-status " + draft.status}>{statusLabels[draft.status]}</span>
                </button>
              ))}
              {!visibleDrafts.length && <div className="empty-state"><Icon name="pen" size={25} /><h3>{error ? "글을 불러오지 못했어요" : filter === "all" ? "첫 글을 함께 시작해요" : "해당 상태의 글이 없어요"}</h3><p>{error ? "목록 새로고침으로 다시 연결해 주세요." : "오른쪽에서 작성한 글이 여기에 쌓입니다."}</p></div>}
              <div className="queue-footer"><span><Icon name="clock" size={12} /> 작성일 최신순</span><span>workspace 멤버 공유</span></div>
            </section>
            <section className="panel studio-panel" id="studio" aria-label="글 편집">
              <div className="studio-heading"><span className="studio-icon"><Icon name="pen" size={21} /></span><div><span className="section-kicker">MAKE SPACE FOR IDEAS</span><h2>{editing ? "글 수정" : "새 글 작성"}</h2><p>생각을 적고, 함께 다듬어 보세요.</p></div></div>
              <form className="draft-editor" onSubmit={saveDraft}>
                <fieldset disabled={busy || !workspace}>
                  <label htmlFor="draft-topic">주제</label>
                  <input id="draft-topic" name="topic" placeholder="어떤 이야기를 나누고 싶나요?" value={topic} onChange={(event) => setTopic(event.target.value)} required maxLength={200} />
                  <label htmlFor="draft-body">본문</label>
                  <textarea id="draft-body" name="body" placeholder="여기에 글을 써보세요." value={body} onChange={(event) => setBody(event.target.value)} maxLength={5000} rows={9} />
                  <div className="draft-editor-meta"><label htmlFor="draft-status">상태</label><span>{Array.from(body).length} / 5,000</span></div>
                  <select id="draft-status" value={status} onChange={(event) => setStatus(event.target.value as DraftStatus)}>
                    <option value="draft">초안</option><option value="pending">승인 대기</option><option value="approved">승인됨</option>
                  </select>
                  {editing && status !== editing.status && <>
                    <label htmlFor="draft-approval-note">상태 변경 메모 (선택)</label>
                    <textarea id="draft-approval-note" value={approvalNote} rows={2} maxLength={1000}
                      placeholder="상태를 변경한 이유를 남겨보세요." onChange={(event) => setApprovalNote(event.target.value)} />
                  </>}
                  <div className="draft-editor-actions">
                    <button className="button primary" type="submit">{busy ? "처리 중…" : editing ? "변경 저장" : "글 저장"}<Icon name="arrow" size={15} /></button>
                    {editing && <button className="draft-secondary" type="button" onClick={() => openDraft(null)}>새 글 작성</button>}
                  </div>
                  {editing && <div className="draft-delete">
                    {confirmDelete ? <><span>이 글을 목록에서 삭제할까요?</span><button type="button" onClick={deleteDraft}>삭제 확인</button><button type="button" onClick={() => setConfirmDelete(false)}>취소</button></>
                      : <button type="button" onClick={() => setConfirmDelete(true)}>이 글 삭제</button>}
                  </div>}
                </fieldset>
              </form>
              {editing && <p className="studio-footnote">작성자 {authorName(editing.author_profile_id)} · 마지막 저장 {savedDate(editing.updated_at)}</p>}
              {editing && <section className="draft-scheduling" aria-label="글 예약">
                <h3>예약시간</h3>
                <p>{editing.scheduled_at ? "저장된 예약: " + scheduledDate(editing.scheduled_at) + " KST" : "저장된 예약이 없습니다."}</p>
                {editing.status === "approved" ? <>
                  <label htmlFor="draft-schedule-time">예약 날짜와 시간 (한국 시간)</label>
                  <input id="draft-schedule-time" type="datetime-local" value={scheduleTime}
                    min={kstInput(scheduleClock)} disabled={busy || !!unsavedChanges}
                    onChange={(event) => setScheduleTime(event.target.value)} />
                  <div className="draft-editor-actions">
                    <button className="button primary" type="button" disabled={busy || !!unsavedChanges || !scheduleTime}
                      onClick={() => saveSchedule()}>{editing.scheduled_at ? "예약 변경" : "예약 저장"}</button>
                    {editing.scheduled_at && <button className="draft-secondary" type="button" disabled={busy || !!unsavedChanges}
                      onClick={() => saveSchedule(true)}>예약 취소</button>}
                  </div>
                  {unsavedChanges && <p>글 변경사항을 먼저 저장한 뒤 예약해 주세요.</p>}
                </> : <p>승인된 글에만 예약시간을 지정할 수 있습니다.</p>}
                <p>시간만 저장합니다. 실제 Threads 게시는 실행되지 않습니다.</p>
              </section>}
              {editing && workspace && <DraftApprovalHistory key={editing.id + editing.updated_at}
                workspaceId={workspace.workspace.id} draftId={editing.id} actorName={authorName} />}
            </section>
          </div>
          <section className="panel drafts-pending-panel" id="schedule" aria-label="예약된 글 목록">
            <div className="panel-heading"><div><span className="section-kicker">PLAN THE NEXT MOMENT</span><h2>예약된 글 <span className="count-pill">{schedule.scheduled.length}</span></h2></div></div>
            <p className="panel-description">한국 시간 예약일 오름차순 · 지정 시간이 지나도 자동 게시되지 않습니다.</p>
            <div className="review-list">
              {schedule.scheduled.map((draft) => (
                <article className="review-card" key={draft.id}>
                  <div className="review-meta"><span>{authorName(draft.author_profile_id)}</span><time dateTime={draft.scheduled_at!}>{scheduledDate(draft.scheduled_at!)} KST</time></div>
                  <h3>{draft.topic}</h3><p>{draft.body}</p>
                  <a className="approve-button" href="#studio" onClick={() => { if (!busy) openDraft(draft); }}>예약 관리<Icon name="arrow" size={14} /></a>
                </article>
              ))}
              {!schedule.scheduled.length && <p className="panel-description">예약된 글이 없습니다. 승인된 글을 열어 예약시간을 지정해 보세요.</p>}
            </div>
          </section>
          <section className="panel drafts-pending-panel" id="review">
            <div className="panel-heading"><div><span className="section-kicker">A SECOND PAIR OF EYES</span><h2>확인을 기다려요 <span className="count-pill violet-pill">{counts.pending}</span></h2></div></div>
            <p className="panel-description">승인 대기 상태로 저장된 글입니다. 글을 열어 함께 검토해 보세요.</p>
            <div className="review-list">
              {drafts.filter((draft) => draft.status === "pending").map((draft) => (
                <article className="review-card" key={draft.id}><div className="review-meta"><span>{authorName(draft.author_profile_id)}</span><span>{savedDate(draft.created_at)}</span></div>
                  <h3>{draft.topic}</h3><p>{draft.body}</p><a className="approve-button" href="#studio" onClick={() => { if (!busy) openDraft(draft); }}>글 열기<Icon name="arrow" size={14} /></a>
                </article>
              ))}
              {!counts.pending && <p className="panel-description">아직 확인을 기다리는 글이 없습니다.</p>}
            </div>
          </section>
          <footer className="dashboard-footer"><span>OUR CONTENT, IN SYNC.</span><a href="/MASTER_PLAN.html" target="_blank" rel="noreferrer">프로젝트 마스터플랜 <Icon name="arrow" size={12} /></a></footer>
        </main>
      </div>
    </div>
  );
}
