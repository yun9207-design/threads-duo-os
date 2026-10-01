"use client";

import { useState } from "react";
import {
  accounts,
  createMockVariants,
  demoDate,
  initialPosts,
  type AccountId,
  type PostStatus,
} from "@/lib/mock-data";
import { Icon, type IconName } from "./icon";

const statusLabels: Record<PostStatus, string> = {
  scheduled: "예약됨",
  review: "승인대기",
  published: "게시완료",
  approved: "승인완료",
  failed: "오류",
};
type Filter = "all" | "scheduled" | "review" | "published";

function Avatar({
  accountId,
  small = false,
}: {
  accountId: AccountId;
  small?: boolean;
}) {
  const account = accounts.find((item) => item.id === accountId)!;
  return (
    <span
      className={`avatar ${account.color} ${small ? "small" : ""}`}
      aria-hidden="true"
    >
      {account.initials}
    </span>
  );
}

export function TodayDashboard() {
  const [posts, setPosts] = useState(initialPosts);
  const [accountFilter, setAccountFilter] = useState<AccountId | "all">("all");
  const [queueFilter, setQueueFilter] = useState<Filter>("scheduled");
  const [expanded, setExpanded] = useState(false);
  const [topic, setTopic] = useState("");
  const [variants, setVariants] = useState<
    ReturnType<typeof createMockVariants>
  >([]);
  const [notice, setNotice] = useState("");

  const filteredPosts = posts.filter(
    (post) => accountFilter === "all" || post.accountId === accountFilter,
  );
  const count = (status: PostStatus) =>
    filteredPosts.filter((post) => post.status === status).length;
  const reviewPosts = filteredPosts.filter((post) => post.status === "review");
  const queue = filteredPosts.filter(
    (post) => queueFilter === "all" || post.status === queueFilter,
  );
  const visibleQueue = expanded ? queue : queue.slice(0, 4);
  const totalReviews = posts.filter((post) => post.status === "review").length;
  const stats: {
    label: string;
    value: number;
    icon: IconName;
    color: string;
    detail: string;
  }[] = [
    {
      label: "오늘 예약",
      value: count("scheduled"),
      icon: "calendar",
      color: "orange",
      detail: "오늘의 콘텐츠가 준비됐어요",
    },
    {
      label: "승인대기",
      value: count("review"),
      icon: "review",
      color: "violet",
      detail: "두 사람의 시선으로 한 번 더",
    },
    {
      label: "게시완료",
      value: count("published"),
      icon: "check",
      color: "green",
      detail: "mock 게시 기록",
    },
    {
      label: "게시 오류",
      value: count("failed"),
      icon: "warning",
      color: "neutral",
      detail: count("failed")
        ? "확인이 필요한 항목이 있어요"
        : "오류 없이 순조로운 하루",
    },
  ];

  function approve(id: string) {
    setPosts((current) =>
      current.map((post) =>
        post.id === id ? { ...post, status: "approved" } : post,
      ),
    );
    setNotice(
      "Mock 초안을 승인했어요. 예약 시간은 아직 지정되지 않았습니다. 새로고침하면 초기화됩니다.",
    );
  }

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main">
        본문으로 건너뛰기
      </a>
      <aside className="sidebar">
        <a className="brand" href="#today" aria-label="Threads Duo OS 홈">
          <span className="brand-mark">
            <i />
            <i />
          </span>
          <span>
            threads duo<span className="brand-sub">OUR CONTENT, IN SYNC.</span>
          </span>
        </a>
        <div className="workspace">
          <span className="workspace-symbol">duo</span>
          <div>
            <strong>Duo Workspace</strong>
            <span>yun & 동생</span>
          </div>
          <span className="workspace-badge">2명</span>
        </div>
        <span className="nav-caption">WORKSPACE</span>
        <nav className="primary-nav" aria-label="대시보드 메뉴">
          <a href="#today" className="nav-item active" aria-current="page">
            <Icon name="grid" />
            <span>Today</span>
            <span className="active-dot" />
          </a>
          <a href="#studio" className="nav-item">
            <Icon name="pen" />
            <span>콘텐츠 스튜디오</span>
          </a>
          <a href="#review" className="nav-item">
            <Icon name="review" />
            <span>승인함</span>
            <span className="nav-count">{totalReviews}</span>
          </a>
          <a href="#queue" className="nav-item">
            <Icon name="calendar" />
            <span>예약 큐</span>
          </a>
          <span className="nav-item disabled">
            <Icon name="chart" />
            <span>인사이트</span>
            <small>예정</small>
          </span>
        </nav>
        <div className="sidebar-bottom">
          <div className="demo-note">
            <span className="status-dot" />
            함께 만드는 작은 실험
            <p>
              지금은 mock 데이터로
              <br />
              우리의 운영 흐름을 살펴보세요.
            </p>
          </div>
          <a href="/MASTER_PLAN.html" className="nav-item plan-link">
            <Icon name="book" />
            <span>프로젝트 마스터플랜</span>
            <Icon name="arrow" size={16} />
          </a>
          <div className="sidebar-profile">
            <Avatar accountId="yun" />
            <div>
              <strong>yun</strong>
              <span>Workspace owner · 데모</span>
            </div>
          </div>
        </div>
      </aside>

      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            Workspace <span>/</span> <strong>Today</strong>
          </div>
          <div className="topbar-right">
            <span className="mock-badge">
              <span />
              Mock mode
            </span>
            <div
              className="avatar-pair"
              aria-label="워크스페이스 구성원 yun과 동생"
            >
              <Avatar accountId="yun" small />
              <Avatar accountId="sibling" small />
            </div>
            <span className="topbar-workspace">Duo Workspace</span>
          </div>
        </header>
        <main id="main">
          <section className="page-heading" id="today">
            <div>
              <div className="eyebrow">
                <span className="sun-symbol" aria-hidden="true">
                  ☀
                </span>{" "}
                YOUR DAY, IN SYNC
              </div>
              <h1>
                Today Dashboard<span className="heading-dot">.</span>
              </h1>
              <p>오늘의 콘텐츠, 두 사람의 다음 한 걸음을 한눈에.</p>
            </div>
            <a className="button primary" href="#studio">
              <Icon name="plus" size={18} />새 초안 만들기
            </a>
          </section>
          <div className="day-toolbar">
            <time dateTime={demoDate.iso}>
              <Icon name="calendar" size={17} />
              {demoDate.label}
              <span className="demo-date-label">데모 기준일</span>
            </time>
            <label className="account-select">
              <span>계정</span>
              <select
                value={accountFilter}
                onChange={(event) => {
                  setAccountFilter(event.target.value as AccountId | "all");
                  setExpanded(false);
                }}
                aria-label="Threads 계정 필터"
              >
                <option value="all">전체 계정</option>
                {accounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name} · {account.handle}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <section className="stats-grid" aria-label="오늘의 운영 현황">
            {stats.map((stat) => (
              <article className="stat-card" key={stat.label}>
                <div className="stat-top">
                  <span>{stat.label}</span>
                  <span className={`stat-icon ${stat.color}`}>
                    <Icon name={stat.icon} size={19} />
                  </span>
                </div>
                <div className="stat-value">
                  {stat.value}
                  <span>건</span>
                  {stat.label === "게시 오류" && stat.value === 0 && (
                    <span className="all-clear">All clear</span>
                  )}
                </div>
                <p>{stat.detail}</p>
              </article>
            ))}
          </section>

          <div className="content-grid">
            <section className="panel queue-panel" id="queue">
              <div className="panel-heading">
                <div>
                  <span className="section-kicker">PLAN YOUR DAY</span>
                  <h2>
                    오늘의 콘텐츠 큐{" "}
                    <span className="count-pill">{filteredPosts.length}</span>
                  </h2>
                </div>
                <span className="subtle-label">{demoDate.short} · KST</span>
              </div>
              <div
                className="queue-tabs"
                role="group"
                aria-label="콘텐츠 상태 필터"
              >
                {(
                  [
                    { id: "all", label: "전체", value: filteredPosts.length },
                    {
                      id: "scheduled",
                      label: "예약",
                      value: count("scheduled"),
                    },
                    { id: "review", label: "승인대기", value: count("review") },
                    {
                      id: "published",
                      label: "게시완료",
                      value: count("published"),
                    },
                  ] as const
                ).map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    className={queueFilter === tab.id ? "selected" : ""}
                    aria-pressed={queueFilter === tab.id}
                    onClick={() => {
                      setQueueFilter(tab.id);
                      setExpanded(false);
                    }}
                  >
                    {tab.label}
                    <span>{tab.value}</span>
                  </button>
                ))}
              </div>
              <div className="queue-table">
                <div className="queue-table-heading" aria-hidden="true">
                  <span>시간 / 계정</span>
                  <span>콘텐츠</span>
                  <span>상태</span>
                </div>
                {visibleQueue.length === 0 ? (
                  <div className="empty-state">
                    <Icon name="check" size={26} />
                    <p>이 상태의 콘텐츠가 없어요.</p>
                  </div>
                ) : (
                  visibleQueue.map((post) => {
                    const account = accounts.find(
                      (item) => item.id === post.accountId,
                    )!;
                    return (
                      <article className="queue-row" key={post.id}>
                        <div className="queue-time">
                          <strong>{post.time}</strong>
                          <span>
                            <Avatar accountId={post.accountId} small />
                            {account.name}
                          </span>
                        </div>
                        <div className="queue-content">
                          <h3>{post.title}</h3>
                          <span>
                            {post.category}
                            <span className="meta-dot">·</span>텍스트
                          </span>
                        </div>
                        <span className={`post-status ${post.status}`}>
                          <span />
                          {statusLabels[post.status]}
                        </span>
                      </article>
                    );
                  })
                )}
              </div>
              <div className="queue-footer">
                <span>
                  <Icon name="clock" size={14} />
                  모든 시간은 한국 표준시 기준
                </span>
                {queue.length > 4 && (
                  <button
                    className="text-button"
                    type="button"
                    onClick={() => setExpanded(!expanded)}
                  >
                    {expanded ? "접기" : `모두 보기 (${queue.length})`}
                    <Icon name="arrow" size={15} />
                  </button>
                )}
              </div>
            </section>

            <section className="panel review-panel" id="review">
              <div className="panel-heading">
                <div>
                  <span className="section-kicker">A SECOND PAIR OF EYES</span>
                  <h2>
                    승인을 기다려요{" "}
                    <span className="count-pill violet-pill">
                      {reviewPosts.length}
                    </span>
                  </h2>
                </div>
              </div>
              <p className="panel-description">
                좋은 콘텐츠의 마지막 단계, 서로의 확인.
              </p>
              <div className="review-list">
                {reviewPosts.length === 0 ? (
                  <div className="empty-state">
                    <Icon name="check" size={28} />
                    <h3>모두 확인했어요!</h3>
                    <p>승인을 기다리는 초안이 없습니다.</p>
                  </div>
                ) : (
                  reviewPosts.map((post) => {
                    const account = accounts.find(
                      (item) => item.id === post.accountId,
                    )!;
                    return (
                      <article className="review-card" key={post.id}>
                        <div className="review-meta">
                          <span>
                            <Avatar accountId={post.accountId} small />
                            {account.name}
                          </span>
                          <span>{post.category}</span>
                        </div>
                        <h3>{post.title}</h3>
                        <p>{post.body}</p>
                        <button
                          className="approve-button"
                          type="button"
                          aria-label={`${post.title} mock 승인`}
                          onClick={() => approve(post.id)}
                        >
                          Mock 승인
                          <Icon name="check" size={15} />
                        </button>
                      </article>
                    );
                  })
                )}
              </div>
            </section>
          </div>

          <div className="bottom-grid">
            <section className="panel studio-panel" id="studio">
              <div className="studio-heading">
                <span className="studio-icon">
                  <Icon name="sparkle" size={23} />
                </span>
                <div>
                  <h2>하나의 아이디어, 다섯 가지 시작</h2>
                  <p>오늘 나누고 싶은 이야기를 초안으로 만들어 보세요.</p>
                </div>
                <span className="mini-badge">MOCK</span>
              </div>
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  const trimmed = topic.trim();
                  if (!trimmed) return;
                  setVariants(createMockVariants(trimmed));
                  setNotice(
                    "템플릿 기반 mock 초안 5개를 만들었어요. 화면 미리보기이며 저장되지 않습니다.",
                  );
                }}
              >
                <label htmlFor="topic" className="sr-only">
                  초안 주제
                </label>
                <div className="topic-input">
                  <input
                    id="topic"
                    required
                    maxLength={120}
                    value={topic}
                    onChange={(event) => setTopic(event.target.value)}
                    placeholder="예: RTX 5060, 나에게 맞는 그래픽카드 고르기"
                  />
                  <button
                    type="submit"
                    className="button primary"
                    disabled={!topic.trim()}
                  >
                    <Icon name="sparkle" size={17} />
                    초안 5개 만들기
                  </button>
                </div>
                <p className="studio-footnote">
                  샘플 템플릿으로 생성됩니다. 실제 AI 호출이나 게시가 이루어지지
                  않습니다.
                </p>
              </form>
              {variants.length > 0 && (
                <div className="variant-list" aria-label="생성된 mock 초안">
                  {variants.map((variant, index) => (
                    <article key={variant.type}>
                      <span>
                        {String(index + 1).padStart(2, "0")} · {variant.type}
                      </span>
                      <p>{variant.text}</p>
                    </article>
                  ))}
                </div>
              )}
            </section>
            <section className="panel accounts-panel">
              <div className="accounts-heading">
                <h2>우리의 계정</h2>
                <span className="mini-badge">2 ACCOUNTS</span>
              </div>
              {accounts.map((account) => (
                <div className="account-row" key={account.id}>
                  <Avatar accountId={account.id} />
                  <div>
                    <strong>{account.handle}</strong>
                    <span>{account.description}</span>
                  </div>
                  <span className="account-placeholder">데모</span>
                </div>
              ))}
              <p>
                <span className="status-dot" />
                계정 연결 전 · 샘플 프로필
              </p>
            </section>
          </div>
          <div className="notice" role="status" aria-live="polite">
            {notice}
          </div>
          <footer className="page-footer">
            <span>
              <span className="footer-logo">duo.</span> 조금 더 가볍게, 함께
              만드는 콘텐츠.
            </span>
            <a href="/MASTER_PLAN.html" className="footer-plan">
              마스터플랜 보기 <Icon name="arrow" size={12} />
            </a>
          </footer>
        </main>
      </div>
    </div>
  );
}
