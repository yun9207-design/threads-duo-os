# Threads Duo OS

최신 추가 기능: **예약 게시 1단계**. approved 글의 `scheduled_at` 저장·수정·취소, Dashboard 예약 목록과 KST 기준 오늘/내일 이후 건수를 실제 DB로 제공한다. 실제 Threads 게시 실행은 추가하지 않는다. [예약 구조와 검증](docs/SCHEDULING.md)을 참고한다. 아래 이전 기능 기록은 보존한다.

최신 추가 기능: **Draft 승인 이력**. 상태 변경 시 변경자·이전/새 상태·시간·선택적 메모를 DB에 자동 기록하고 기존 글 편집 카드에서 시간순으로 조회한다. [구조와 사용 흐름](docs/APPROVAL_HISTORY.md)을 참고한다.

현재 구현: **실제 Supabase Drafts CRUD**. 실제 프로젝트에 migration을 적용하고 기존 로그인 세션으로 작성·목록·수정·상태 변경·새로고침 유지·soft delete·관리자 복구와 외부 workspace 차단을 확인했다. Dashboard의 글 목록·건수·승인 대기 카드는 DB 데이터를 사용한다. Auth/Session/Workspace/기존 RLS는 완료된 기반으로 동결한다. 구현·DB 구조·적용 상태는 [docs/DRAFTS.md](docs/DRAFTS.md), 검증 증거는 [docs/TEST_NOTES.md](docs/TEST_NOTES.md)를 기준으로 한다. 아래 초기 mock 기록은 개발 이력으로 보존한다.

두 명이 함께 사용하는 비공개 Threads 운영 웹앱.

## Product loop
아이디어/상품 → AI 초안 → 사람 승인 → 예약 → Threads 공식 API 게시 → Insights → 성과학습

## Tech
Next.js + TypeScript / Supabase / Vercel / Meta Threads API

## Start
1. MASTER_PLAN.html 열기
2. MVP_SPEC.md 읽기
3. START_PROMPT.md를 Claude 또는 Codex에 붙여넣기
4. 한 번에 P0 하나씩 구현하기

## Safety
첫 OAuth/게시 테스트는 메인 계정이 아닌 테스트/서브 Threads 계정으로 진행.

## 2026-10-01 — Today Dashboard 프로토타입

Next.js App Router + TypeScript로 `/` 첫 화면을 초기화했다. Today Dashboard는 두 사람의 Threads 운영 상태를 mock data로 보여 주는 로컬 프로토타입이다.

- `/`: Today Dashboard. 오늘의 예약, 승인 대기, 게시 완료, 오류와 운영 큐를 확인한다.
- `/MASTER_PLAN.html`: 기존 마스터플랜. 프로젝트 루트의 `MASTER_PLAN.html` 원본과 기존 문서는 모두 유지한다.
- `public/MASTER_PLAN.html`: 원본을 정적 경로로 제공하기 위한 사본. 개발·빌드 시 원본에서 동기화한다.

데모 기준일은 한국 시간 `2026-10-01`로 고정한다. 초기 데이터는 오늘 예약 8건, 승인 대기 3건, 게시 완료 4건, 오류 0건이다. 계정 필터와 상태별 큐 필터, 큐 전체 보기, `Mock 승인`, 주제별 템플릿 초안 5개 미리보기를 제공한다. 승인은 메모리에서 `review → approved`만 바꾸며 예약이나 게시를 실행하지 않는다. 생성된 초안은 저장하지 않는다.

Today·콘텐츠 스튜디오·승인함·예약 큐 메뉴는 첫 화면 내 섹션으로 이동한다. 별도 Studio·Approval·Calendar 페이지나 인사이트 화면은 아직 구현하지 않는다.

### 파일 구조

| 경로 | 역할 |
| --- | --- |
| `app/layout.tsx` | 공통 레이아웃과 metadata |
| `app/page.tsx` | `/` Today Dashboard 진입점 |
| `app/globals.css` | 대시보드와 모바일 스타일 |
| `app/icon.svg` | 앱 아이콘 |
| `components/today-dashboard.tsx` | mock 상태와 첫 화면 상호작용 |
| `components/icon.tsx` | 공통 아이콘 |
| `lib/mock-data.ts` | 예시 계정·게시물과 초안 템플릿 |
| `scripts/sync-master-plan.mjs` | 원본 마스터플랜을 정적 사본으로 동기화 |
| `MASTER_PLAN.html` | 보존하는 마스터플랜 원본 |
| `public/MASTER_PLAN.html` | `/MASTER_PLAN.html` 제공용 사본 |
| `docs/TEST_NOTES.md` | 실제 확인 결과 |

### 로컬 실행과 확인

Node.js 24.x와 npm을 사용한다.

```powershell
npm install
npm run dev
```

브라우저에서 `http://localhost:3000/`와 `http://localhost:3000/MASTER_PLAN.html`을 연다. 3000 포트가 사용 중이면 실행 로그에 표시된 포트를 사용한다.

```powershell
npm run lint
npm run typecheck
npm run build
npm run start
```

`start`는 `build` 성공 후 프로덕션 빌드를 실행한다. 실제 검증 결과는 `docs/TEST_NOTES.md`에 기록한다.

`dev`, `build`, `start`는 실행 전에 `scripts/sync-master-plan.mjs`로 마스터플랜 사본을 동기화한다. 원본을 편집한 뒤 개발 서버를 재시작하지 않고 사본만 갱신하려면 `npm run sync:master-plan`을 실행한다.

### Vercel 설정

프로젝트 루트 디렉터리를 이 저장소의 루트로 설정하고 Framework Preset은 **Next.js**, Build Command는 `npm run build`, Output Directory는 기본값 `.next`를 사용한다. 초기 UI 구현은 로컬 검증까지 진행했다. 배포는 연결된 GitHub 저장소 `yun9207-design/threads-duo-os`의 `main`에 push해 Vercel Git 연동으로 진행한다.

### 프로토타입 구현 당시 범위

Supabase, Threads API, OAuth, 실제 AI 생성, 실제 게시·예약 작업은 연결하지 않는다. 로그인과 DB 저장도 아직 구현하지 않는다. 화면의 상태 변경은 브라우저 메모리에서만 유지되며 새로고침하면 초기 mock data로 돌아간다. 계정, 게시물, 수치와 시간은 예시 데이터다.

### 검증 결과

lint·TypeScript·프로덕션 빌드가 통과했다. 개발·프로덕션 로컬 서버에서 `/`와 `/MASTER_PLAN.html` 모두 HTTP 200과 Chrome 렌더링을 확인했다. 계정 필터·mock 승인·템플릿 5개 미리보기, 390px·320px 모바일과 기존 마스터플랜 탭·데모도 검증했다. 마스터플랜 원본·사본·HTTP 본문은 작업 전 SHA256과 일치한다. 상세 기록과 스크린샷은 [TEST_NOTES](docs/TEST_NOTES.md)에 있다.

### Git 저장소 구조

기존 GitHub 업로드는 `threads-duo-os/` 아래 기획 문서만 포함했다. 이 기존 폴더와 문서는 그대로 보존한다. 실행 가능한 Next.js 앱과 갱신한 문서는 저장소 루트에 두어 Vercel의 루트 빌드 대상이 되도록 한다. 루트 `MASTER_PLAN.html`이 정적 사본 동기화의 기준이다.

## 2026-10-01 — Supabase Auth 1단계: 로컬 검증 완료

이메일/비밀번호 로그인, 쿠키 세션, 로그인 사용자 이메일 표시와 현재 브라우저의 로그아웃을 구현했다. 사용자가 제공한 실제 Supabase URL·publishable 공개 키를 Git에서 제외된 `.env.local`에 설정했다. 로그인 실패·익명 접근 차단은 실제 브라우저 자동화로, 정상 로그인·이메일 표시·새로고침 유지·로그아웃·로그아웃 후 재접근 차단은 사용자 브라우저의 수동 확인과 제공 화면으로 검증했다. 설정이 없거나 세션 검증에 실패하면 `/`는 `/login`으로 이동한다. Dashboard를 볼 수 있는 데모 로그인 우회는 제공하지 않는다.

- `/login`: 이메일·비밀번호 입력, 로그인 실패 오류와 연결 준비 안내. 로그인한 사용자는 `/`로 이동한다.
- `/`: Proxy에서 세션을 갱신하고 페이지 서버에서 `getUser()`로 사용자를 확인한 뒤 Today Dashboard에 이메일을 표시한다.
- 로그아웃: `signOut({ scope: "local" })`으로 현재 브라우저 세션을 종료하고 `/login`으로 이동한다.
- `/MASTER_PLAN.html`: 기존대로 공개 정적 문서를 제공한다.
- 계정·workspace·콘텐츠 큐·승인·초안·운영 수치는 계속 mock이다. DB 테이블·Storage·Threads API·AI·실제 예약/게시 기능은 추가하지 않았다.

### Supabase에서 직접 준비할 항목

1. Supabase 프로젝트의 **Connect**에서 Project URL과 **publishable key**를 가져온다. 키는 **Settings → API Keys**에서도 확인할 수 있다. 이 프로젝트는 publishable 공개 키만 사용한다. secret/service role key는 사용하지 않는다. [공식 API Keys 안내](https://supabase.com/docs/guides/getting-started/api-keys)
2. **Authentication**에서 Email/Password 로그인을 활성화하고, **Users**에서 로그인에 사용할 테스트 사용자의 이메일·비밀번호를 직접 준비한다. Email 확인을 요구하는 프로젝트라면 테스트 사용자가 확인 완료 상태여야 한다. 회원가입·이메일 확인·비밀번호 재설정 UI는 이번 범위에 없다. [공식 Password Auth 안내](https://supabase.com/docs/guides/auth/passwords)
3. 아래 명령으로 로컬 파일을 만들고 `.env.local`의 비어 있는 항목을 채운다. 이 파일은 Git에서 무시된다.

```powershell
Copy-Item .env.example .env.local
```

| 변수 | 설정할 값 |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | 실제 Project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | 실제 publishable 공개 키 |

`.env.example`에는 값이 없는 두 변수명만 있다. `.env.local`을 저장한 뒤 개발 서버를 재시작한다. `NEXT_PUBLIC_` 값은 브라우저 빌드에 포함되므로 비밀키나 사용자 토큰을 입력하면 안 된다. 로컬 Production 빌드를 확인할 때는 설정 변경 후 다시 build한다.

### Auth 파일과 검증 상태

`app/login/page.tsx`와 `components/login-form.tsx`는 로그인 화면, `components/session-controls.tsx`는 사용자 이메일과 로그아웃 버튼이다. `lib/supabase/client.ts`는 브라우저용, `lib/supabase/server.ts`는 요청별 서버용 클라이언트다. `proxy.ts`와 `lib/supabase/proxy.ts`는 `/`·`/login`의 세션 갱신과 접근 보호를 처리한다. 인증 경로는 동적 렌더링과 캐시 방지를 사용한다. [공식 SSR 안내](https://supabase.com/docs/guides/auth/server-side/nextjs)

로컬 Chrome에서 로그인 표시, 입력 검증, 설정 누락 시 오류, 익명 `/` 접근 차단, 마스터플랜 보존을 확인했다. 실제 공개 설정 적용 후 잘못된 로그인 요청에 Supabase의 HTTP 400 `invalid_credentials` 응답과 화면 오류가 표시됐다. 사용자는 실제 계정의 Dashboard·이메일 표시·F5 후 로그인 유지, 로그아웃 → `/login` 이동, 이후 `/` 직접 접근 → `/login` 차단을 확인했다. 사용자 세션은 자동화 브라우저와 달라 정상 세션 흐름은 수동 검증으로 기록한다. lint·typecheck·production build 통과. 상세 결과는 `docs/TEST_NOTES.md`에 있다. 이번 Auth 변경은 로컬 작업만 수행했으며 GitHub push나 Vercel 재배포는 하지 않았다.

## 2026-10-01 — Auth Production 배포 및 검증 완료

후속 배포 요청에 따라 Auth 커밋 `ef46831`을 GitHub `main`에 push했고 Vercel Production 배포가 Ready 상태로 완료됐다. 현재 주소는 [threads-duo-os.vercel.app](https://threads-duo-os.vercel.app/)이다. Vercel 프로젝트의 Environment Variables에 `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` 두 공개 변수를 Production 대상으로 저장했다. `.env.local`은 commit하지 않았고 ANON_KEY 대체 설정은 제거했다. 공개 변수 변경 시 새 Production build가 필요하다.

Supabase Site URL은 `https://threads-duo-os.vercel.app`으로 설정했다. 현재 비밀번호 로그인은 callback이 필요하지 않으며 OAuth·추가 Redirect URL은 구현하지 않았다. 기존 테스트 계정으로 실제 Production 로그인과 이메일 표시를 확인하고, 같은 사용자 창을 자동화로 새로고침해 세션 유지, 로그아웃 → `/login`, 익명 `/` 재접근 차단을 검증했다. `/login`·`/MASTER_PLAN.html` HTTP 200, MASTER_PLAN 원본 SHA256 일치도 확인했다. 배포 전 lint/typecheck/build 통과. 기존 Dashboard 운영 데이터는 계속 mock이다. 상세 증거는 `docs/TEST_NOTES.md`에 기록했다.

## 2026-10-01 — Workspace / RLS 단계

실제 Supabase에 `profiles`, `workspaces`, `workspace_members`와 조회용 RLS를 적용했다. 공동 workspace는 실제 확인 완료 사용자 A(owner)·B(member) 두 명으로 구성했다. 역할은 사용자 전체가 아닌 workspace별 멤버십에 저장한다. 익명·다른 workspace·클라이언트 쓰기·역할 승격은 허용하지 않는다. 데이터 변경용 앱 기능은 제공하지 않고 관리자 SQL로 준비한다.

- `GET /api/workspaces`: 로그인 사용자가 속한 workspace만 조회한다.
- `GET /api/workspaces/[workspaceId]`: 접근 가능한 workspace·현재 역할·멤버 표시 정보를 조회한다. 외부 ID와 없는 ID는 동일한 404, 익명은 401이다.
- 쿼리는 기존 요청별 서버 클라이언트와 실제 사용자 세션을 사용한다. 환경변수는 기존 공개 변수 두 개 그대로이며 service/secret key를 추가하지 않았다.
- 기존 `/login`, Dashboard, 로그아웃과 공개 `/MASTER_PLAN.html`은 유지한다. Dashboard의 workspace 이름·운영 큐·계정·수치는 계속 mock 표시다.

스키마·권한·관리자 provisioning·검증 방법은 [WORKSPACE_ACCESS](docs/WORKSPACE_ACCESS.md), 실제 A/B 브라우저 및 DB 검사 결과는 [TEST_NOTES](docs/TEST_NOTES.md)에 기록한다. A/B 외부 ID 검증용 전용 workspace 두 개는 `[RLS verification]` 이름으로 구분해 보존한다. 앱 변경은 로컬 검증 상태이며 이번 단계에서 GitHub push·Vercel 배포는 수행하지 않았다. 초안·Threads 계정·예약·AI·게시 기능은 구현하지 않았다.

## 2026-10-01 — Auth / Workspace / RLS Production 완료

후속 배포 요청에 따라 workspace/RLS commit `ebc7716`을 main에 push했고 Vercel Git 배포가 완료됐다. [Production](https://threads-duo-os.vercel.app/)에서 로그인·익명 보호·workspace API·MASTER_PLAN 제공을 확인했다. 실제 A/B 공동 조회(owner/member)와 외부 ID 차단·세션 유지·로그아웃은 기존 로컬/DB 결과, Production 정상 로그인은 사용자의 Chrome 확인을 근거로 한다. 사용자 요청에 따라 추가 A/B 수동 재검사는 중단했다. lint/typecheck/build를 최종 재확인해 모두 통과했으며 상세 범위와 결과는 `docs/TEST_NOTES.md`에 기록했다. Auth·workspace·RLS 기반을 완료 처리하고 다음 기능은 실제 drafts DB CRUD다. Dashboard의 운영 콘텐츠와 수치는 계속 mock이다.
