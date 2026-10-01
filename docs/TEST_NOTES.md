# TEST NOTES

## 2026-10-01 — Draft Approval History

`20261001095837_draft_approval_history.sql`을 실제 프로젝트에 적용했다. 기존 Auth/Session/Workspace/기존 RLS 검사와 A/B 로그인은 반복하지 않았다. 새로운 이력 테이블의 멤버 SELECT 정책, private 기록 trigger, invoker 메모 RPC만 추가했다. 기존 CRUD/Dashboard/MASTER_PLAN/MD를 유지한다.

- `node scripts/test-approval-history.mjs`: PASS. PostgreSQL에서 draft → pending → approved의 정확히 2개 이력과 시간순 조회를 확인했다. actor/workspace 및 선택적 메모가 맞고 본문/같은 상태 재저장에는 추가 이력이 없다.
- 기존 실제 로그인 세션의 UI에서 새 검증 글을 작성하고 두 번 상태를 변경했다. 첫 메모는 `검토를 부탁해요`, 두 번째는 미입력이다. GET history와 화면에 정확히 2건이 표시됐다.
- 실제 SQL 대조: 글 `d1817933-be0b-4497-8ca6-bd78212b8b1b`의 draft → pending 시각은 `2026-10-01T09:59:31.016297Z`, pending → approved는 `2026-10-01T09:59:32.025968Z`다. 두 actor_user_id는 기존 A UID이며 메모는 첫 행의 입력값/둘째 null과 일치했다. 화면에는 KST 18:59:31 → 18:59:32 순서로 표시됐다.
- 검증 글은 기존 UI로 soft delete해 정리했고 DB 이력은 그대로 2건 보존됐다. 사용자 글을 수정/삭제하지 않았다. [실제 이력 화면](screenshots/approval-history-live.jpg).
- lint/typecheck/production build: PASS. 새 GET history 경로가 동적 API로 빌드됐다. 기존 Auth 파일·workspace DAL/API·이전 migration은 변경하지 않았다. MASTER_PLAN 원본/사본 SHA256이 기존 값과 동일하고 실제 env 및 CLI 임시 파일은 Git 제외다.
- Supabase security advisor에 새 이력 테이블/함수 경고는 없다. 기존 [Auth 유출 비밀번호 보호 비활성 경고](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection)는 이전 단계에서 기록한 동일 항목이며 동결 범위라 설정을 변경하지 않았다.

위 검증 상태로 main에 commit/push하여 Vercel Git 배포한다. 배포 성공 여부는 해당 커밋의 Vercel status와 최종 실행 보고를 기준으로 한다. 게시/AI/예약/Threads 기능은 추가하지 않았다.

## 2026-10-01 — Drafts 실제 Supabase 적용 / CRUD 완료

Supabase 연결 후 준비된 migration 002를 실제 프로젝트 `qemmkooyjmqaduofoquf`에 적용했다. 원격 이력: `20261001090952 / drafts_crud`. 기존 세 테이블과 멤버십은 그대로이며 새 테이블의 3개 RLS 정책/열 권한을 확인했다. 앱은 기존 publishable 키와 로그인 쿠키를 사용하고 관리자 연결은 migration 및 해당 테스트 행 확인/복구에만 사용했다.

| 실제 검사 | 결과 |
| --- | --- |
| 기존 세션에서 새 글 1개 작성 | POST 201, 목록 GET 200; SQL에서 동일 id/workspace/작성자와 draft 저장 확인 |
| 본문 수정 / 상태 변경 | UI 저장으로 pending → approved; SQL의 수정 본문·상태·updated_at과 일치 |
| 새로고침 | 로그인된 Dashboard의 목록·수정 본문·approved 1건 유지 |
| 삭제 | DELETE 200, 목록 0건; 원문/상태를 보존하고 deleted_at 기록 |
| 복구 | 해당 id에만 관리자 UPDATE로 deleted_at=null; 목록 새로고침 후 동일 글 재등장 |
| 테스트 정리 | 같은 글을 UI에서 다시 soft delete; 활성 글 0건, 보존된 테스트 행 1개 |
| 다른 workspace API | 기존 A 세션에서 B 전용 workspace의 Drafts GET 404; 내용 비노출 |
| 새 Drafts RLS | 실제 DB authenticated/A claims에서 외부 SELECT 숨김 및 INSERT 거절; 검사 transaction rollback |
| 최종 품질 | lint / typecheck / production build PASS; `/`·Drafts API는 동적 경로 |
| 보존 | 기존 Auth/Session/workspace 파일·정책 수정 없음; MASTER_PLAN 원본/사본 hash 동일, 모든 기존 MD 유지, 실제 env Git 제외 |

새로운 로그인·A/B 반복 로그인·기존 RLS 50개 재검증은 수행하지 않았다. 다른 workspace API 검사는 임시 로컬 검사 페이지의 정상 fetch로 수행했고 해당 파일은 삭제해 배포에서 제외했다. 실제 작업 화면: [새로고침 후 수정 본문·approved 상태](screenshots/drafts-live-approved.jpg). 테스트 글 ID는 `b9581d63-1aa9-413f-a407-aeab8f3e65a4`이며 사용자 콘텐츠를 삭제하지 않았다.

Supabase security advisor에 새 Drafts RLS 경고는 없었다. 기존 Auth의 [유출 비밀번호 보호 비활성 경고](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection)는 동결 범위여서 설정을 변경하지 않았다. Performance advisor의 [미사용 인덱스 정보](https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index)는 신규 drafts_author_idx 및 기존 workspace 작성자 인덱스이며 FK 조회용으로 유지한다.

검증된 변경은 GitHub main에 push하여 기존 Vercel Git 연동으로 배포한다. 해당 commit의 Vercel status와 Production HTTP smoke 결과는 최종 실행 보고에서 확인한다. 다음 기록은 도구 연결 전의 개발 이력이며 현재 적용 상태와 구분한다.

### 이전 연결 대기 단계 기록

사용자가 Supabase 연결 완료를 알리고 실제 migration/CRUD/배포를 요청했다. 현재 이 채팅의 실행 가능한 도구 목록에는 Supabase SQL/migration 도구가 없으며 로컬 MCP 목록에도 Supabase 서버가 노출되지 않았다. 내장 브라우저의 프로젝트 SQL Editor는 관리자 sign-in 화면으로 이동했고, 기존 Chrome의 관리자 세션 연결은 응답하지 않았다. 실제 비밀번호/쿠키/토큰을 추출하거나 새 로그인·기존 Auth/RLS 검사를 요청하지 않았다.

공개 설정으로 Drafts Data API의 테이블 가용성만 조회한 결과 HTTP 404/PGRST205(스키마 캐시에서 drafts를 찾지 못함)였다. 민감한 값은 출력하지 않았다. 실제 SQL 적용/새 글 생성/CRUD 검사는 실행하지 못했으며 commit/main push/새 Production 배포도 하지 않았다. 기존 기반 배포와 Auth/workspace/MASTER_PLAN/기존 MD를 보존했다. 관리자 SQL 도구가 이 작업에서 호출 가능해지는 것이 남은 의존성이다.

기반 main/Vercel 배포(`9dd7e70`)를 유지하고 Auth·Session·Workspace·기존 RLS를 동결했다. 기존 RLS 50개 및 A/B 로그인 검사는 반복하지 않았다. 새 migration 002/typed DAL/CRUD API/입력 검증과 Dashboard의 실제 목록·편집·상태·soft delete를 구현했다. 실제 연결이 실패하면 오류를 표시하며 mock fallback이 없다.

- `node scripts/test-drafts.mjs`: PASS. 새 Drafts migration과 실제 PostgreSQL 권한을 디스크 DB에서 실행했다. owner 작성·조회 → member 본문 수정 및 pending/approved 저장 → 오래된 version 덮어쓰기 거절 → DB close/reopen 후 수정 내용 유지 → soft delete/활성 목록 제외를 확인했다. 외부 workspace read/update/delete/insert, 작성자 위조, identity 변경, invalid status/길이, anon 조회·쓰기와 물리 DELETE 차단도 통과했다. 관리자용 새 Drafts SQL smoke 템플릿도 이 DB에서 통과했다. 실제 Supabase 검사와 구분한다.
- `node scripts/smoke-drafts-http.mjs`: 새 API에서 익명 읽기/쓰기 401, 다른 Origin 403, identity/invalid status/missing version 입력 400, 32KB 초과 413, private/no-store 및 내부 오류 비노출을 확인했다. 로그인 요청은 하지 않았다. 최초 localhost/127.0.0.1 내부 URL 차이로 정상 Origin도 거절되는 문제가 있었으며 새 Drafts HTTP helper에서 incoming Host를 기준으로 비교해 수정했다.
- `npm run lint`, `npm run typecheck`: PASS. `npm run build`: sandbox의 worker spawn EPERM 후 허용된 일반 실행으로 PASS. 기존 Auth 파일·workspace DAL/API·migration 001은 수정하지 않았다.
- MASTER_PLAN 원본/정적 사본 SHA256이 모두 `3073aaab4c243c773675df4e123c8e3508e09caf1bf9529effe67022dfa34dff`로 동일하다. 기존 MD 삭제는 없다. `.env.local`·테스트 디스크 DB는 Git 제외 상태이며 공개 변수/키 구조도 변경하지 않았다.
- 기존 로컬 로그인 세션에서 새 Dashboard가 사용자 이메일·Duo workspace owner를 유지하며 실제 DB 연결 실패 메시지를 표시했다. 추가 로그인 없이 이 세션에서 CRUD를 자동 검사할 수 있다. 관리자 세션/SQL connector가 연결되지 않아 실제 Supabase migration 002는 아직 적용하지 않았다. 실제 저장·화면 CRUD 완료로 기록하지 않으며 Drafts push/배포도 보류한다. 연결 후 새 테이블 적용·실제 CRUD 증거를 이 절에 추가한다.

- [x] MASTER_PLAN 탭 동작
- [x] 모바일 레이아웃
- [ ] P0 smoke test

## 2026-10-01 — Next.js Today Dashboard 검증

검증 범위는 mock data로 `/` Today Dashboard를 보고, 기존 마스터플랜을 `/MASTER_PLAN.html`에서 열어 사용하는 흐름이다. 전체 P0 smoke test는 로그인·DB·Draft CRUD·실제 예약 등이 아직 구현되지 않아 미완료로 유지한다.

### 실행 환경과 품질 검사

- Windows, Node.js 24.19.0, npm 11.17.0.
- Next.js 16.3.8, React 19.3.0, TypeScript 6.0.3.
- agent-browser 0.38.1과 로컬 Chrome의 headless 브라우저로 검증.
- `npm run lint`: 통과.
- `npm run typecheck`: 통과. App Router 타입 생성과 TypeScript 검사 완료.
- `npm run build`: 통과. 빌드 출력의 `○ /`로 루트 정적 페이지 생성 확인.
- 개발 모드: `http://127.0.0.1:3000`.
- 최종 프로덕션 빌드 실행: `http://127.0.0.1:3001`.

### 주소와 문서 보존

| 모드 | 주소 | 결과 |
| --- | --- | --- |
| 개발 | `/` | HTTP 200, `Today Dashboard` 표시 |
| 개발 | `/MASTER_PLAN.html` | HTTP 200, 기존 마스터플랜 표시 |
| 프로덕션 | `/` | HTTP 200, Chrome에서 Today Dashboard 렌더링 확인 |
| 프로덕션 | `/MASTER_PLAN.html` | HTTP 200, 대시보드의 링크로 이동해 마스터플랜 확인 |

루트 원본, `public/MASTER_PLAN.html` 사본과 두 서버의 HTTP 본문은 모두 작업 전 원본 SHA256과 일치했다. 원본은 변경하지 않았다.

```text
3073aaab4c243c773675df4e123c8e3508e09caf1bf9529effe67022dfa34dff
```

기존 README·PROJECT_PLAN·MVP_SPEC·DB_SCHEMA·SECURITY·START_PROMPT·docs/DECISIONS·docs/TEST_NOTES를 모두 유지했다. 관련 MD에는 현재 구현 범위와 검증 결과를 추가했고 MVP의 Today/mobile 항목을 갱신했다.

### 실제 브라우저 동작

| 확인 항목 | 결과와 증거 |
| --- | --- |
| 첫 화면 현황 | 예약 8 / 승인대기 3 / 게시완료 4 / 오류 0 |
| 계정 필터 | `yun` 선택 시 4 / 2 / 2 / 0. 큐·승인함이 yun 항목만 표시; 전체 선택으로 복원 |
| 예약 큐 펼치기 | 기본 4행 → 모두 보기 8행 |
| 승인대기 탭 | 검토 대상 3행만 표시 |
| Mock 승인 | 승인대기 3 → 2, `approved` 1건으로 변경. 예약 8·게시완료 4 유지 |
| 전체 큐 | 15행; 승인한 항목은 `승인완료`로 표시 |
| 템플릿 초안 | 빈 주제는 생성 버튼 비활성. 주제 입력·클릭 후 5개 variant 표시 |
| 새로고침 | 8 / 3 / 4 / 0과 큐 기본 4행으로 초기화; 생성한 variant 제거 |
| 모바일 | 390×844 및 320×844에서 document 폭이 viewport 폭과 같아 가로 넘침 없음 |
| 모바일 문서 링크 | 320px에서 하단 링크를 클릭해 `/MASTER_PLAN.html`로 이동 확인 |
| 마스터플랜 탭 | 16개 버튼 존재; `04 · 화면` → `pane-04`, `12 · MVP` → `pane-12`, 전략 탭으로 복원 |
| 기존 마스터플랜 데모 | `04 · 화면`의 기존 생성 버튼 클릭 시 `#demo`의 display가 none → block |
| 브라우저 오류 | 두 경로에서 page error 없음. Today에 Next.js 오류 overlay 0개; console에 HMR/DevTools 안내만 확인 |
| 외부 호출 | 대시보드 초기 로드·필터·mock 승인·템플릿 생성 중 다른 origin의 resource 요청 0개 |

모바일 확인 중 Next.js 개발 표시가 하단 링크를 가리는 것을 발견해 `devIndicators: false`로 설정했다. 실제 오류 표시 기능은 유지되며, 수정 후 320px에서 링크 클릭을 다시 확인했다.

### 화면 기록

- [Today 데스크톱](screenshots/today-desktop.png): 1440×1000 viewport, 최종 프로덕션 화면 전체 캡처.
- [Today 모바일](screenshots/today-mobile.png): 390×844 viewport, 전체 화면 캡처.
- [기존 마스터플랜](screenshots/master-plan.png): 1440×1000 viewport.

Supabase·Threads API·실제 AI·OAuth·DB 저장·실제 게시·예약은 이번 작업에서 연결하거나 실행하지 않았다. 초기 UI 검증 시점에는 Vercel 원격 재배포를 수행하지 않았다.

## 2026-10-01 — main 배포 전 최종 smoke test

- 새 기능을 추가하지 않고 기존 구현을 재검증했다.
- `http://127.0.0.1:3000/`와 `/MASTER_PLAN.html`: HTTP 200, Chrome 화면과 실제 하단 링크 이동 정상, page error 없음.
- `npm run lint`와 `npm run typecheck` 재검사 통과. 프로덕션 build는 기존 최종 검사에서 통과했다.
- 기존 마스터플랜 원본·정적 사본 SHA256 일치, 기존 MD 8개와 원래 내용 보존 확인.
- Vercel 프로젝트에서 `github.com/yun9207-design/threads-duo-os`, Production 브랜치 `main` 연결을 확인했다.
- 기존 main `2987c920946e743ff10a839a42fb945740508bfa`는 `threads-duo-os/` 아래 문서만 포함하고, Vercel은 repository root / Other preset이었다. 배포 전 Production `/`와 `/MASTER_PLAN.html`은 모두 `404 NOT_FOUND`를 반환했다.
- 원격 이력을 현재 폴더에 연결하고 기존 원격 문서 폴더도 복원했다. 해당 폴더는 변경 없이 유지하며 실행 가능한 앱을 저장소 루트에 추가한다.
- 이 커밋의 main push로 Vercel Git 배포를 시작하고 Ready 여부와 두 Production 경로를 확인한다. 실제 배포 결과는 작업 최종 보고에 기록한다.

## 2026-10-01 — Supabase Auth 1단계 로컬 검증

Supabase URL·publishable/anon 공개 키가 프로젝트의 env 파일과 현재 환경에 없었다. 값을 임의로 만들거나 가짜 인증 서버/세션을 사용하지 않고, Auth 코드와 로그인 UI를 연결 준비 상태로 구현했다. 이 기록의 오류 테스트는 설정 누락과 입력 검증이며 실제 잘못된 비밀번호의 Auth 응답 테스트가 아니다.

### 실제 브라우저/HTTP 결과

Chrome(headless), 개발 `http://127.0.0.1:3000`, 로컬 Production build `http://127.0.0.1:3001`에서 확인했다.

| 항목 | 결과 |
| --- | --- |
| `/login` | 두 모드 HTTP 200, 이메일·비밀번호·로그인 버튼·설정 준비 안내 표시 |
| 설정 누락 상태에서 제출 | 오류 메시지 표시, `/login` 유지; Supabase/Threads 외부 호출 없음 |
| 잘못된 이메일 형식 | Chrome 기본 입력 검증으로 제출 차단; 비밀번호 필수 입력도 폼에 적용 |
| 익명 `/` 직접 접근 | 두 모드 HTTP 307 → `/login`; HTTP 본문에 Dashboard 큐 내용 없음 |
| 익명 새로고침 | `/login` 유지; 인증 우회 없음 |
| 로그인 모바일 | 개발 320×844, Production 390×844에서 viewport 폭과 document 폭 일치; 폼과 문서 링크 접근 가능 |
| `/MASTER_PLAN.html` | 두 모드 HTTP 200; 로그인 화면 링크로 이동, 기존 16개 탭과 화면 탭 동작 확인 |
| 문서 원본 | 루트·public 사본·두 HTTP 본문 SHA256 모두 `3073aaab4c243c773675df4e123c8e3508e09caf1bf9529effe67022dfa34dff`로 동일 |
| 브라우저 오류 | 두 경로 page error 없음 |
| Production 인증 경로 캐시 | `/`·`/login`의 `Cache-Control`에 `private`, `no-store` 확인 |
| 실제 잘못된 비밀번호 응답 | 미검증: Supabase 설정·테스트 사용자 필요 |
| 정상 로그인 → Dashboard와 사용자 이메일 | 미검증: Supabase 설정·테스트 사용자 필요 |
| 새로고침 후 로그인 세션 유지 | 미검증: Supabase 설정·테스트 사용자 필요 |
| 로그아웃 → `/login` → `/` 재접근 차단 | 실제 로그인 세션으로는 미검증; 익명 `/` 차단은 확인 |

### 품질·보안·범위

- `npm run lint`, `npm run typecheck`, `npm run build`: 통과. build 출력에서 `/`와 `/login`은 `ƒ` 동적 경로, Proxy 포함.
- `.env.local`·`.env.test.local`은 `git check-ignore`로 제외 확인. `.env.example`에는 실제 값 없이 URL·publishable·legacy anon 변수명만 있다. 공개 키는 둘 중 하나만 준비하면 된다.
- `.env.local`은 값이 없어 생성하지 않았다. 실제 키·비밀번호·토큰은 코드나 Git에 추가하지 않았다. 입력 테스트에 쓴 주소/문자열은 외부 전송 없는 테스트 입력이다.
- 서버는 요청별 클라이언트와 `getUser()`를 사용하고, Proxy는 `getClaims()` 검증/갱신 및 요청·응답 쿠키 동기화를 처리한다. 로그아웃은 현재 세션만 종료하도록 `scope: "local"`을 지정한다.
- 운영 계정·workspace·draft·승인·큐·수치는 기존 mock이다. DB 테이블·migration·Storage·AI API·Threads API·예약/게시 기능을 추가하지 않았다.
- 기존 MASTER_PLAN과 MD 파일 삭제 없음. 기존 `threads-duo-os/` 문서 폴더는 변경하지 않았다. GitHub push·Vercel 배포는 수행하지 않았다.
- 화면 기록: [로그인 데스크톱](screenshots/login-desktop.png), [로그인 모바일](screenshots/login-mobile.png). 표시된 이메일은 테스트 입력이고 비밀번호는 마스킹 상태다.

### 수정/생성 파일

`.env.example`, `.gitignore`, `package.json`, `package-lock.json`, `proxy.ts`, `app/page.tsx`, `app/login/page.tsx`, `app/globals.css`, `components/today-dashboard.tsx`, `components/login-form.tsx`, `components/session-controls.tsx`, `lib/supabase/config.ts`, `lib/supabase/client.ts`, `lib/supabase/server.ts`, `lib/supabase/proxy.ts`, `README.md`, `PROJECT_PLAN.md`, `MVP_SPEC.md`, `DB_SCHEMA.md`, `SECURITY.md`, `docs/TEST_NOTES.md`, `docs/screenshots/login-desktop.png`, `docs/screenshots/login-mobile.png`.

다음 검증은 Supabase 공개 설정과 확인된 테스트 계정을 준비한 뒤 실제 비밀번호 실패·로그인·사용자 이메일·새로고침 세션 유지·로그아웃·익명 재접근 차단을 로컬 브라우저에서 한 번에 확인하는 것이다.

후속 연결 준비: Supabase 프로젝트 생성 및 Next.js/App Router Connect 화면을 확인한 뒤, 빈 `.env.example`에서 `.env.local` 입력 파일을 생성했다. `.env.local`의 Git 제외를 다시 확인했다. 화면에서 잘린 URL·공개 키는 추정해 입력하지 않았으며 실제 값 입력과 Auth 검증은 대기 중이다.

## 2026-10-01 — 실제 Supabase 공개 설정 적용

사용자가 제공한 Project URL과 publishable 공개 키를 Git에서 제외된 `.env.local`에 저장하고 3000 포트의 프로젝트 개발 서버만 재시작했다. 실제 값은 이 문서나 `.env.example`에 기록하지 않는다. `.env.local`은 Git 추적 대상이 아니며 `.env.example`의 값이 비어 있는 것을 다시 확인했다.

- 실제 Chrome의 `/login`에서 설정 준비 안내가 사라졌다.
- 잘못된 로그인용 테스트 입력으로 실제 Supabase Auth 요청을 한 번 실행했다. 응답은 HTTP 400 `invalid_credentials`, 화면에는 이메일·비밀번호 확인 오류가 표시됐고 버튼은 다시 활성화됐다. 계정 생성·비밀번호 재설정·이메일 발송은 호출하지 않았다.
- 익명 `/` 접근은 계속 `/login`으로 이동하고, 로그인 화면의 마스터플랜 링크는 `/MASTER_PLAN.html`로 정상 이동했다. page error 없음.
- 화면 기록: [실제 연결 후 로그인 오류](screenshots/login-connected.png). 테스트 이메일과 마스킹된 테스트 입력만 표시한다.
- 정상 로그인·서버 확인 이메일·새로고침 로그인 유지·로그아웃은 확인된 테스트 사용자의 로그인 후 검증해야 한다. 로그인 P0는 아직 완료로 표시하지 않는다.
- 실제 `.env.local`을 읽은 `npm run build` 재검증도 통과했다. 기존 lint/typecheck 통과 이후 Auth 소스 변경은 없다. 사용자는 로그인 계정을 아직 만들지 않았다고 확인했으며, 사용자 준비 후 남은 정상 세션 검증을 진행한다.
- 애플리케이션 테이블·Storage·AI·Threads API·예약/게시 기능을 추가하지 않았다. GitHub push·Vercel 배포도 수행하지 않았다.

### 정상 로그인 후속 확인

사용자는 생성한 계정으로 로그인에 성공했고 `http://127.0.0.1:3000/#studio`를 보고 있다고 확인했다. 같은 시점의 개발 서버 로그에도 `GET / 200`이 기록됐다. 자동화에 연결된 브라우저에서는 별도 로그인 화면만 확인되어 사용자 세션을 직접 검사하지 못했다. 검증 브라우저의 루트 접근은 `/login#studio`로 이동했다. 로그인 성공은 사용자 확인으로 기록하며, 사용자 이메일 표시·새로고침 유지·로그아웃의 실제 세션 검증은 아직 완료로 표시하지 않는다. 비밀번호나 세션 토큰을 읽거나 복사하지 않았다.

후속 증거: 사용자가 F5 후에도 Dashboard와 이메일이 유지된다고 확인했고 로그인 이메일·로그아웃 버튼이 표시된 실제 Dashboard 스크린샷을 제공했다. [사용자 제공 Dashboard 화면](screenshots/auth-dashboard-user-confirmed.png)을 보존했다. 정상 로그인과 사용자 정보 표시는 사용자 화면으로, 새로고침 세션 유지는 사용자 수동 확인으로 검증 완료했다. 자동화가 해당 세션에서 수행한 것으로 기록하지 않는다. 남은 항목은 동일 사용자 창의 로그아웃과 로그아웃 후 `/` 재접근 차단이다. 화면 주소는 로컬 `127.0.0.1:3000`이며 이번 Auth 변경의 Vercel 배포는 수행하지 않았다.

## 2026-10-01 — Auth 1단계 최종 로컬 결과

사용자는 동일 로그인 창에서 로그아웃과 `/` 직접 재접근 모두 로그인 화면으로 이동한다고 확인했고, 주소가 `127.0.0.1:3000/login`인 후속 화면을 제공했다. Auth 1단계의 로컬 흐름 검증을 완료한다. 앞선 대기 상태 기록은 당시의 이력이며 최종 상태는 아래 표를 기준으로 한다.

| 검증 항목 | 최종 결과 | 증거 방식 |
| --- | --- | --- |
| `/login` 표시 | 통과 | 실제 Chrome 자동화·HTTP 200 |
| 잘못된 로그인 오류 | 통과 | 실제 Auth HTTP 400 `invalid_credentials`와 UI 오류 |
| 정상 로그인 → Dashboard | 통과 | 사용자 수동 확인·제공 화면·서버 `GET / 200` |
| 현재 사용자 이메일 표시 | 통과 | 사용자 제공 Dashboard 화면 |
| F5 후 로그인 유지 | 통과 | 사용자 브라우저의 수동 확인 |
| 로그아웃 → `/login` | 통과 | 사용자 수동 확인·후속 로그인 화면 |
| 로그아웃 후 `/` 직접 접근 차단 | 통과 | 사용자 수동 확인; 익명 HTTP 307 자동 확인도 완료 |
| `/MASTER_PLAN.html` | 통과 | 실제 브라우저·HTTP 200·원본 SHA256 일치 |
| lint/typecheck/production build | 통과 | 해당 npm 명령 실행; 실제 `.env.local` 적용 후 build도 통과 |

자동화 브라우저와 사용자 브라우저의 세션이 달라 정상 세션 흐름을 자동화 검사로 표시하지 않는다. 로그아웃 후 사용자 제공 화면은 브라우저 주변 UI를 포함하므로 Git에서 제외된 `.tools/auth-logout-user-confirmed.png`에만 로컬 보관했다. 최종 Dashboard 증거는 `docs/screenshots/auth-dashboard-user-confirmed.png`에 있다.

README·PROJECT_PLAN·MVP_SPEC·DB_SCHEMA의 현재 상태를 갱신했고 SECURITY의 Auth 원칙은 유지한다. MASTER_PLAN 원본과 기존 MD 삭제 없음. `.env.local`은 Git 제외, `.env.example`은 빈 값, service role/secret key·애플리케이션 DB·Threads API는 사용하지 않았다. 코드 commit·GitHub push·Vercel 배포는 수행하지 않았다.

추가/후속 파일은 Git 제외 `.env.local`, `docs/screenshots/login-connected.png`, `docs/screenshots/auth-dashboard-user-confirmed.png`와 관련 문서 갱신이다. 다음 권장 작업은 별도 Vercel 환경변수 설정·Auth 배포·Production 검증 한 단계이며, 현재 요청의 로컬 범위에서는 실행하지 않는다.

## 2026-10-01 — Auth Production 배포 전 최종 확인

후속 요청에서 Auth Production 배포를 승인했다. 새 UI·DB·Threads/AI API 기능은 추가하지 않았다. `git status`와 diff를 검토했으며 Auth 구현·공개 설정·관련 문서·검증 화면만 변경되어 있다. 기존 tracked MD 18개 모두 존재하고 삭제 파일은 0개다. MASTER_PLAN 원본·public 사본과 기존 문서 폴더에는 diff가 없다.

- 공개 설정은 `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` 두 변수로 통일했다. 사용하지 않는 legacy ANON_KEY fallback·빈 env 항목은 제거했다. `.env.local`은 Git 제외 상태이고 `.env.example`에는 두 빈 변수명만 있다.
- Vercel `bluegee/threads-duo-os` Dashboard에 두 공개 변수를 **Production만** 대상으로 저장했다. Preview/Development에는 추가하지 않았다. service-role/secret key는 사용하지 않았다.
- Supabase Authentication → URL Configuration의 Site URL을 `https://threads-duo-os.vercel.app`으로 저장했다. 이메일/비밀번호의 `signInWithPassword` 후 앱 자체 이동만 사용하므로 callback·OAuth·Redirect URL wildcard는 추가하지 않았다. [공식 Password Auth](https://supabase.com/docs/guides/auth/passwords), [공식 Redirect URL 설정](https://supabase.com/docs/guides/auth/redirect-urls)
- 최종 소스로 `npm run lint`, `npm run typecheck`, `npm run build` 모두 통과했다. `/`·`/login`은 동적 경로이고 Proxy 포함이다.
- 사용자는 기존 계정으로 로컬 로그인 → Dashboard 이메일 확인 → F5 세션 유지 → 로그아웃 → 익명 `/` 직접 접근 차단을 다시 실행하고 모두 정상이라고 확인했다. 비밀번호·세션 토큰을 읽거나 전달받지 않았다.
- 개발 3000 및 최종 Production build 3001에서 익명 `/login` HTTP 200, `/` HTTP 307 → `/login`, `/MASTER_PLAN.html` HTTP 200을 확인했다. 루트 응답에 Dashboard 데이터 노출 없음. 3001 인증 응답에 `private`, `no-store` 확인. 두 MASTER_PLAN HTTP 본문 SHA256이 원본과 동일하다. 실제 Chrome에서도 로그인 화면·익명 접근 차단·마스터플랜 기존 화면을 다시 확인했다.
- `git fetch origin main` 후 HEAD와 origin/main의 차이는 0/0으로, 원격 추가 변경 없음. 이후 Auth 커밋의 main push를 통해 Vercel Git 배포를 진행한다. Production 정상 세션은 배포 완료 후 기존 테스트 계정으로 검증한다.

## 2026-10-01 — Auth Production 실제 검증 완료

- Auth 커밋: `ef46831b01c0ce9da468fd5b67e181a0b066a6e3` (`feat: add Supabase email authentication`). GitHub main push 성공. Auth 외 기능 변경 없음.
- Vercel Git 배포: `dpl_81TyGshTswxJhQuSScjFSAT1Sgru`, Production, Ready, build 27초, main/위 커밋 일치. [배포 상세](https://vercel.com/bluegee/threads-duo-os/81TyGshTswxJhQuSScjFSAT1Sgru)
- Production alias: `https://threads-duo-os.vercel.app/`. 빌드별 URL: `https://threads-duo-db5sp8l7h-bluegee.vercel.app/`.

| 항목 | Production 결과 | 증거 방식 |
| --- | --- | --- |
| `/login` | HTTP 200, 로그인 폼 정상, 설정 누락 안내 없음 | HTTP 요청·실제 Chrome |
| 정상 이메일/비밀번호 로그인 | Dashboard와 현재 사용자 이메일 표시 | 기존 테스트 계정의 사용자 직접 로그인·동일 사용자 탭 자동화 확인 |
| 새로고침 세션 유지 | Dashboard·이메일·로그아웃 버튼 유지 | 로그인된 동일 Production Chrome 탭을 자동화로 reload |
| 로그아웃 | `/login` 이동·로그인 폼 표시 | 동일 탭 로그아웃 버튼 클릭·URL 확인 |
| 로그아웃 후 `/` 직접 접근 | `/login` 이동, Dashboard 미표시 | 동일 탭 직접 탐색·별도 익명 HTTP 307 확인 |
| `/MASTER_PLAN.html` | HTTP 200, 기존 탭·내용 정상 | 실제 Production 브라우저·HTTP SHA256이 원본과 동일 |
| 인증 경로 캐시 | `private`, `no-store`; `/login` CDN MISS | 익명 `/`·`/login` 실제 응답 헤더 |
| 브라우저 오류 | error/warn 로그 없음 | 실제 사용자 Production 탭의 console 검사 |
| 서버 오류 | Warning/Error/Fatal 0 | 해당 Auth 배포로 필터한 최근 30분 Vercel 런타임 로그; 인증 상태 `/` 200과 로그아웃 후 307 기록 |

테스트 사용자는 로컬에서 준비한 기존 계정만 사용했다. 자동화용 새 사용자·가짜 세션·비밀번호 재설정은 만들지 않았다. 사용자가 직접 비밀번호를 입력한 후 실제 로그인된 사용자 탭을 선택하여 나머지 흐름을 검증했다. 비밀번호·세션 쿠키·토큰 값은 읽거나 전달받지 않았다. 로그인하지 않은 별도 자동화 탭의 상태를 정상 사용자 세션으로 오인하지 않았다.

검증 화면은 Git에서 제외된 `.tools/vercel-production-env.jpg`, `.tools/supabase-production-url.jpg`, `.tools/vercel-auth-ready.jpg`, `.tools/production-auth-session.jpg`, `.tools/production-auth-logout.jpg`에 로컬 보관했다. README·PROJECT_PLAN·MVP_SPEC·SECURITY에 현재 Production 상태를 추가하고 이 검증 기록을 문서 커밋으로 main에 반영한다. 운영 데이터는 계속 mock이며 MASTER_PLAN·모든 기존 MD·기존 Dashboard는 보존했다.

## 2026-10-01 — Workspace / RLS 실제 적용 및 A/B 검증

사용자의 후속 명시 요청에 따라 SQL 파일 준비뿐 아니라 현재 Supabase 프로젝트에 실제 DB를 적용했다. 시작 시 git tree는 clean이었다. 기존 public/private 애플리케이션 테이블이 없음을 먼저 조회했고, 관리자 SQL Editor에서 `supabase/migrations/202610010001_workspace_access.sql`을 한 트랜잭션으로 실행했다. 세 테이블과 세 SELECT 정책, private 읽기 helper 두 개를 생성했다. 기존 Auth 테이블·정책·로그인 UI와 Dashboard 동작은 변경하지 않았다. SQL Editor로 수동 적용한 migration이며 CLI migration history를 생성/수정하지 않았다. 동일 migration을 재실행하면 기존 객체 때문에 실패하므로 향후 CLI 적용 전 실제 스키마와 이 기록을 확인해야 한다.

### 실제 데이터 구성

- 사용자 A: 기존 확인 완료 계정. 사용자 B: 사용자가 직접 추가한 확인 완료 계정. 두 계정의 실제 Auth 사용자 ID로 프로필과 멤버십을 구성했다. 비밀번호를 채팅으로 받거나 토큰·쿠키 값을 추출하지 않았다.
- `Duo Workspace`: `efe8e127-ae8b-41af-ab76-2308d3347158`, A=owner, B=member.
- `[RLS verification] A only`: `60e2ca48-3252-4e62-869a-749747cab144`, A만 owner.
- `[RLS verification] B only`: `9b846486-9759-4bb9-b3a7-7ad1bff52380`, B만 owner.
- 전용 workspace 두 개는 실제 존재하는 다른 ID의 접근 차단을 검증하기 위한 데이터이며 재검증용으로 보존한다. 공동 workspace와 합쳐 workspace 3개·profiles 2개·members 4개를 준비했다. 초안·Threads 계정·운영 데이터는 넣지 않았다.

### 실제 브라우저 → 앱 API → Supabase Data API

사용자가 Chrome에서 직접 A/B의 비밀번호를 입력한 뒤, 각 계정의 이메일이 표시된 실제 로그인 창을 연결했다. 동일한 창을 새로고침하고 API를 호출해 그 세션의 서버 클라이언트가 Supabase RLS를 통과하는 결과를 확인했다. 서버 조회에는 공개 키와 현재 사용자 세션만 사용했으며 별도 관리자 키를 사용하지 않았다.

| 검사 | 결과 |
| --- | --- |
| A 로그인 → Dashboard | A 이메일·기존 Today 화면 정상 |
| A 공동 workspace 상세 | HTTP 200, role=owner, A/B 두 멤버와 표시 이름 반환 |
| A workspace 목록 | 공동·A-only만 반환, B-only 제외 |
| A가 실제 B-only ID 지정 | HTTP 404, workspace/멤버 정보 없음 |
| B 로그인 → Dashboard | B 이메일·기존 Today 화면 정상 |
| B 공동 workspace 상세 | HTTP 200, 동일 workspace ID, role=member, A/B 두 멤버 반환 |
| B workspace 목록 | 공동·B-only만 반환, A-only 제외 |
| B가 실제 A-only ID 지정 | HTTP 404, workspace/멤버 정보 없음 |
| A/B 새로고침 | Dashboard 이메일 유지, 검사 페이지 새로고침 후 공동 API 200과 원래 역할 유지 |
| A/B 로그아웃 | 기존 로그아웃 버튼 → `/login` 정상 |
| 로그아웃 후 `/` 직접 접근 | `/login` 이동, Dashboard 미표시 |
| 로그아웃 후 공동 workspace API | HTTP 401, ‘로그인이 필요합니다.’ |
| API 캐시 | 성공/404/401 응답의 `private, no-store` 확인 |
| `/MASTER_PLAN.html` | 로그인 없이 기존 문서·탭 정상 표시, HTTP 200 |

Chrome이 JSON API의 최상위 문서 탐색을 `ERR_BLOCKED_BY_CLIENT`로 표시했으나 같은 요청은 개발 서버 로그에서 HTTP 200이었다. 결과 확인에는 잠시 만든 로컬 검사 HTML의 정상 버튼 동작으로 동일 API를 직접 호출하고 응답 본문·상태를 표시했다. 이 검사 페이지는 토큰/쿠키 값을 읽지 않았고 검증 후 제거했다. 제품 UI·브라우저 보안 설정을 변경하거나 검사 페이지를 남기지 않았다.

### 실제 DB / 직접 Data API 및 격리 PostgreSQL 검사

- `supabase/tests/workspace_access.sql`의 UUID를 실제 A/B와 위 3개 workspace로 바꾸어 관리자 SQL Editor에서 실행했다. `SET LOCAL ROLE authenticated` + 실제 `auth.uid()`로 A/B 공동 조회·외부 workspace/멤버십 비노출·동료 프로필 조회·owner/member 역할·쓰기/승격 차단을 확인했다. anon 조회 및 private helper 실행도 차단됐다.
- RLS 활성화·authenticated SELECT·익명/쓰기 권한 회수, private helper 소유권·SECURITY DEFINER·search_path 설정을 검사했다. 인증 주체가 비어 있는 authenticated 역할에서도 행이 보이지 않았다.
- B 공동 멤버십을 트랜잭션 안에서 일시 제거한 뒤 같은 subject로 공동 workspace/멤버십/A 프로필 접근이 차단됨을 확인했다. 검사 전체는 ROLLBACK해 원래 데이터로 복원했다. 최종 결과는 `PASS`였다. SQL Editor에 검증문을 교체하는 과정에서 붙여넣기가 기존 내용에 섞인 실행은 syntax error로 실패했고, 전체 선택 후 올바른 파일로 교체해 재실행한 최종 검사가 통과했다. 제품 스키마 수정은 필요하지 않았다.
- 실제 Supabase REST Data API에 공개 키만 붙인 **익명** SELECT 요청을 보냈다. profiles/workspaces/workspace_members 모두 HTTP 401 + `42501`로 차단됐다. `Accept-Profile: private` 요청은 HTTP 406 + `PGRST106`으로, private 스키마가 Data API에 노출되지 않았음을 확인했다. 키 값은 출력하지 않았다.
- `node scripts/test-workspace-rls.mjs`: 격리된 PGlite PostgreSQL에서 **50개 assertion 통과**. A/B/C/D fixture와 실제 migration으로 읽기 경계, 비멤버·익명·빈 subject, CRUD/승격 차단, 실수로 쓰기 grant를 추가해도 정책으로 차단, FK·역할·중복/owner 제약, search_path 조작과 멤버십 제거를 검사했다. 이는 실제 Supabase 비밀번호 로그인 검증과 별도 결과다.

### 품질·보존·범위

- `npm run lint`, `npm run typecheck`, `npm run build` 통과. 처음 sandbox build의 TypeScript 작업자 시작은 `spawn EPERM`으로 차단됐으며 동일 명령을 허용된 프로세스 권한으로 실행해 완료했다. `/api/workspaces` 및 ID 상세 경로는 동적 Route Handler다.
- git diff를 점검했다. 기존 Auth 서버 클라이언트의 변경은 schema generic 타입 추가뿐이며 app/page·login UI·session controls·Dashboard·mock data·proxy·환경변수 파일·package/lockfile에는 변경이 없다.
- 기존 tracked MD 18개 모두 존재, 삭제 0개. 관련 MD는 기존 기록을 유지하고 이번 상태를 추가했다. 기존 `threads-duo-os/` 기획 문서 폴더도 그대로다.
- MASTER_PLAN 원본과 public 사본 SHA256: `3073aaab4c243c773675df4e123c8e3508e09caf1bf9529effe67022dfa34dff`. 작업 전과 동일하며 `/MASTER_PLAN.html` HTTP 본문도 동일하다. 중첩 원본 문서에는 diff가 없다.
- `.env.local`은 여전히 Git 제외 상태, `.env.example`은 두 빈 공개 변수뿐이다. 새 환경변수·service/secret key·Auth trigger·쓰기 RPC·OAuth callback은 추가하지 않았다.
- 실제 DB의 workspace 기반은 적용했지만 앱 변경은 로컬 검증 단계다. 이번 작업에서 commit/push·Vercel 앱 배포는 수행하지 않았다. 기존 Production Auth 배포는 유지한다. 운영 콘텐츠·초안·Threads 계정·승인·예약·AI·게시는 계속 mock/미구현이다.

### 변경 파일 및 증거

- 코드: `app/api/workspaces/route.ts`, `app/api/workspaces/[workspaceId]/route.ts`, `lib/workspaces.ts`, `lib/supabase/database.types.ts`, `lib/supabase/server.ts`.
- DB·검사: `supabase/migrations/202610010001_workspace_access.sql`, `supabase/provision_workspace.sql`, `supabase/tests/workspace_access.sql`, `scripts/test-workspace-rls.mjs`.
- 문서: README, PROJECT_PLAN, MVP_SPEC, DB_SCHEMA, SECURITY, 이 TEST_NOTES, 새 `WORKSPACE_ACCESS.md`.
- 증거: [실제 RLS/권한](screenshots/workspace-rls-applied.png), [실제 DB 검사 PASS](screenshots/workspace-db-tests.png), [A 공동 workspace](screenshots/workspace-a-shared.png), [B 공동 workspace](screenshots/workspace-b-shared.png), [외부 ID 차단](screenshots/workspace-foreign-denied.png).

workspace/RLS 단계에서 멈춘다. 다음 콘텐츠 기능은 시작하지 않는다.

## 2026-10-01 — Workspace / RLS Production 배포 전 재검사

후속 요청에서 현재 workspace/RLS 변경의 commit·main push·Production 검증을 승인했다. 새 기능이나 UI는 추가하지 않는다. git status/diff를 검토했고 기존 Auth·Dashboard·mock data·MASTER_PLAN·환경변수·package/lockfile에는 diff가 없다. 기존 tracked MD 18개가 모두 존재하며 삭제 파일은 없다. 원격 main을 fetch한 결과 시작 커밋 `07a7a18116b597ab60dbe5f5f85306299d89d6d2`와 origin/main의 차이는 0/0이었다.

- `node scripts/test-workspace-rls.mjs`: 격리 PostgreSQL 50개 assertion 재통과.
- `npm run lint`, `npm run typecheck`, `npm run build`: 모두 재통과. 기존 Auth 경로와 workspace API가 동적 경로로 포함됐다.
- 실제 Supabase 익명 Data API 조회: profiles/workspaces/workspace_members 모두 HTTP 401 + `42501`. private 스키마 요청은 HTTP 406 + `PGRST106`으로 차단됐다.
- 로컬 익명 HTTP smoke: `/login` 200, `/` 307 → `/login`, workspace 목록/공동 상세 API 401, `/MASTER_PLAN.html` 200. MASTER_PLAN 응답 SHA256이 원본과 일치한다. API 응답은 `private, no-store`다.
- 환경변수는 기존 URL·publishable 공개 변수 두 개만 사용한다. `.env.local`은 Git 제외 상태이며 새 환경변수·service/secret key가 없다. Supabase의 기존 실제 스키마와 정책을 그대로 사용하므로 migration/provisioning을 재실행하지 않는다.

실제 A/B 로그인 상태의 로컬 재검사와 Production 결과는 완료 후 별도로 기록한다.

### 로컬 A 후속 재검사

사용자가 내장 브라우저의 A 로그인 화면이 계속 로딩 중이라고 알렸다. 기존 탭은 자동화 읽기에도 응답하지 않았지만 같은 브라우저의 새 탭은 `/login`에서 `/`로 이동하고 서버가 확인한 A 이메일을 표시했다. 로그인 세션은 이미 정상 생성돼 있었으며 기존 탭의 표시/제어 문제가 관찰됐다. Auth 코드·브라우저 보안 설정은 변경하지 않았다.

새 정상 탭에서 Dashboard reload 후 A 이메일 유지, 공동 workspace API 200 + owner + A/B 두 멤버, 목록의 공동/A-only만 노출, 실제 B-only ID 404, 검사 페이지 reload 후 공동 조회/역할 유지, 로그아웃 → `/login`, 익명 `/` → `/login`, 공동 API 401을 다시 확인했다. MASTER_PLAN도 익명 브라우저에서 기존 내용으로 표시됐다. JSON API 최상위 탐색은 계속 브라우저에서 차단돼 이전 단계와 동일하게 임시 로컬 HTML의 일반 버튼으로 읽기 요청을 실행했다. 이 파일은 commit/Production 배포 대상에 넣지 않으며 검사 후 제거한다. 비밀번호·세션 쿠키·토큰 값은 읽지 않았다.

### 최종 로컬 B 재검사 완료

사용자가 직접 B 비밀번호를 입력한 실제 내장 브라우저 탭에서 Dashboard와 B 이메일을 확인했다. Dashboard 새로고침 후에도 B 이메일이 유지됐으며 공동 API는 200 + member + A/B 두 멤버를 반환했다. 목록에는 공동/B-only만 포함됐고 실제 A-only ID는 404로 차단됐다. 검사 페이지 새로고침 후 공동 조회/역할도 유지됐다. B 로그아웃은 `/login`으로 이동했고 익명 `/` 재접근은 로그인 화면, 공동 API는 401이었다. A/B 결과의 캐시는 `private, no-store`다. 임시 로컬 검사 HTML은 제거했으며 commit/배포하지 않는다. 기존 Auth 코드는 변경하지 않았다. 최종 로컬 A/B smoke가 모두 통과했으므로 기존 workspace/RLS 변경을 main에 반영한다.

## 2026-10-01 — Workspace / RLS main 배포

- 구현 commit: `ebc771615a5ce4d2aac3ebfec5291737aae333d1` (`feat: add workspace membership and RLS access controls`). 21개 파일만 포함했고 `.env.local`·`.tools`·임시 검사 HTML은 제외했다.
- GitHub main push 성공: `07a7a18..ebc7716`. 원격과 로컬 main이 일치한다.
- Vercel GitHub commit status: 처음 pending(`Vercel is deploying your app`), 이후 success(`Deployment has completed`)로 전환됐다. [배포 상세](https://vercel.com/bluegee/threads-duo-os/2BPegQ6W5S8pEtNXyG9yfduRs4ET), main/구현 commit 기준으로 확인했다.
- Production alias: `https://threads-duo-os.vercel.app/`. 배포 완료 후 `/login` 200, 익명 `/` 307 → `/login`, workspace 목록·공동 상세 API 401을 확인했다. API 캐시는 `private, no-store`다. `/MASTER_PLAN.html`은 200이며 HTTP 본문 SHA256이 보존한 원본과 일치한다.
- 기존 Vercel Production 공개 환경변수 두 개와 이미 적용된 Supabase RLS를 그대로 사용했다. DB migration·provisioning 재실행, 새 키·설정·Auth/UI/콘텐츠 기능 변경은 없다.

### 최종 완료 기준

사용자가 Production Chrome에서 A 로그인 성공을 확인했다. 현재 Chrome 자동 연결이 되지 않아 해당 세션의 정상 workspace 응답·로그아웃을 자동 검사한 것으로 기록하지 않는다. 이후 사용자가 추가 A/B 수동 재검증을 중단하고 기존 결과와 RLS 50개 통과 결과를 신뢰해 단계를 완료하라고 명시했다. 따라서 이전 실제 A/B 공동 조회 200(owner/member)·외부 ID 404·세션/로그아웃/익명 차단과 실제 Supabase DB 검사를 최종 권한 근거로 유지한다. 이번 Production 정상 로그인은 사용자 1회 확인, workspace HTTP smoke는 익명 401 차단 확인이며 추가 정상 A/B 전체 반복 검사를 수행하지 않았다.

최종 `git status`/diff에는 배포 기록 문서 외 변경이 없었다. `npm run lint`, `npm run typecheck`, `npm run build`를 다시 실행해 모두 통과했다. 기존 Auth·Dashboard·MASTER_PLAN에 diff 없음, 기존 MD 삭제 없음, 현재 tracked MD 19개 모두 존재. 실제 환경변수·임시 검사 화면은 Git 제외/제거 상태다. 사용자 지정 검증 범위에 따라 Auth + workspace + RLS 기반 단계를 완료 처리하며 다음 단계는 실제 drafts DB CRUD다. drafts 구현은 이 배포 commit에 포함하지 않는다.
