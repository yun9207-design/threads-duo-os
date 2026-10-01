# DECISIONS

- 2026-10-01: 공식 Threads API 우선.
- 초기 자동화는 AI 생성 → 사람 승인 → 예약 게시.

## 2026-10-01 — Next.js Today 프로토타입

- 루트 `/`를 Next.js App Router의 Today Dashboard로 구현한다. 초기 기술 범위는 Next.js + TypeScript와 mock data다.
- 기존 `MASTER_PLAN.html` 원본과 기존 문서는 삭제하거나 대체하지 않는다. 정적 제공용 `public/MASTER_PLAN.html`을 원본에서 동기화하여 `/MASTER_PLAN.html` 경로를 유지한다.
- Supabase, Threads API, OAuth, 실제 AI 생성·게시·예약과 DB 영속 저장은 연결하지 않는다. 계정과 지표는 데모 데이터로 표시한다.
- 화면의 상태 변경은 브라우저 메모리에서만 유지한다. 새로고침 시 mock 초기값으로 복원한다.
- Vercel의 Framework Preset은 Next.js, 저장소 루트에서 `npm run build`, 기본 Output Directory는 `.next`를 기준으로 한다. 초기 UI 구현은 로컬 검증까지 진행하고, 후속 배포는 연결된 GitHub `main` push를 사용한다.
- lint·TypeScript·production build와 로컬 브라우저 두 경로 검증을 수행하고 실제 결과를 `docs/TEST_NOTES.md`에 기록한다.
- 모바일에서도 마스터플랜을 열 수 있도록 페이지 하단에 문서 링크를 제공한다. Next.js 개발 표시가 좁은 화면의 링크를 가리지 않도록 `devIndicators: false`를 설정한다.
- 기존 원격 저장소의 `threads-duo-os/` 문서 폴더는 보존한다. Next.js 앱은 저장소 루트에 추가하며 `vercel.json`의 `framework: "nextjs"`로 기존 Other preset을 배포별로 재정의한다.
