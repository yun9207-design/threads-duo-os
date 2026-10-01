# PROJECT PLAN — Threads Duo OS

예약 게시 1단계 구현: 승인된 글의 예정 시간 저장·수정·취소와 실제 DB 기반 예약 목록·오늘/다가오는 예약 집계. 실제 Supabase migration 적용 및 기존 세션의 예약/새로고침 검증을 완료했다. Auth/Workspace/CRUD/승인 이력 재검증을 반복하지 않았으며 실제 게시 실행은 범위에 없다. 상세는 `docs/SCHEDULING.md`를 따른다.

최신 완료 범위는 Draft 승인 이력이다. 실제 DB trigger와 메모 저장 RPC, 멤버 전용 이력 조회, 기존 편집 카드의 시간순 이력 표시를 추가했다. draft → pending → approved의 정확히 2건을 격리 DB와 기존 실제 세션에서 확인했다. 아래 Drafts 완료 기록을 보존하며 Auth/Workspace/기존 RLS 검사는 반복하지 않았다. 상세는 `docs/APPROVAL_HISTORY.md`를 따른다.

현재 완료 범위는 Drafts 실제 DB CRUD다. Auth/Session/Workspace/기존 RLS는 동결하며 추가 A/B 로그인이나 동일 권한 검사를 반복하지 않았다. 기반 main/Vercel 배포(`9dd7e70`) 이후 글의 작성·목록·수정·soft delete와 draft/pending/approved 상태 저장을 구현했다. 실제 Supabase 적용, 기존 세션의 브라우저 CRUD·새로고침 유지·복구·외부 workspace 차단과 lint/type/build 검사를 통과했다. 테스트 글 한 개는 복구 확인 후 다시 soft delete했다. 상세 적용 상태는 `docs/DRAFTS.md`를 따른다. Threads·AI·예약·게시·성과·결제는 이번 범위에 없다.

## Product thesis
두 사람이 여러 Threads 계정을 관리하면서 AI 생성, 승인, 예약, 성과분석을 하나의 운영화면에서 처리한다.

## Core loop
Capture → Generate → Review → Approve → Schedule → Publish → Measure → Learn

## Stage A — Prototype
Today / Studio / Approval / Calendar / mock data

## Stage B — Backend
Supabase Auth / users-workspaces / drafts / RLS / Storage

## Stage C — Threads
Meta App / OAuth / long-lived token lifecycle / text publish / media publish

## Stage D — Intelligence
Style profile / duplicate detection / Viral Lab / performance recommendations

## Stage E — Daily use
2-user collaboration / notifications / failure recovery / audit log

## 2026-10-01 — Stage A 시작: Today 첫 화면

이번 작업 범위는 Next.js App Router 초기화와 `/` Today Dashboard mock 프로토타입이다. 예약·승인·게시·오류 요약, 예시 계정과 시간순 운영 큐를 통해 첫 운영 화면을 확인한다. 기존 `MASTER_PLAN.html` 원본과 모든 문서는 유지하고, 원본의 정적 사본을 `/MASTER_PLAN.html`에서 제공한다.

Supabase와 Threads API는 연결하지 않는다. 로그인, 영속 저장, 실제 AI 생성, 실제 예약·게시, Studio·Approval·Calendar 전체 화면은 다음 작업 범위로 남긴다. UI 상태는 새로고침 시 mock 초기값으로 복원된다.

첫 화면은 `2026-10-01` 한국 시간 기준으로 예약 8건·승인 대기 3건·게시 완료 4건·오류 0건을 보여 준다. 계정·상태 필터, 큐 펼치기, mock 승인과 템플릿 초안 5개 미리보기는 화면 검증용 상호작용이다. `review → approved` 변경은 실제 승인 이력이나 예약 저장이 아니며 생성 초안도 저장하지 않는다. 메뉴는 동일 페이지 내 섹션 이동으로 제공한다.

로컬 품질 검사는 lint, TypeScript, 프로덕션 build와 브라우저의 `/`·`/MASTER_PLAN.html` 확인으로 진행한다. 검증 결과와 viewport별 확인 내용은 `docs/TEST_NOTES.md`에 남긴다. 초기 UI 구현은 로컬 검증까지 진행했으며, 이후 연결된 GitHub `main`에 push해 Vercel Production 배포를 진행한다.

검증 완료: lint·TypeScript·production build 통과. 개발·프로덕션 로컬 서버에서 두 경로 HTTP 200, Chrome 화면과 mock 상호작용, 390px·320px 모바일 레이아웃과 마스터플랜 기존 탭·데모를 확인했다. 원본·정적 사본·HTTP 본문의 SHA256이 작업 전 마스터플랜과 일치했다.

이후 P0 진행 상황과 다음 단계는 아래 Auth 기록을 기준으로 한다.

## 2026-10-01 — Stage B 중 Supabase Auth 1단계 로컬 검증 완료

`/login` 이메일/비밀번호 폼, 브라우저·서버 Supabase 클라이언트 분리, Proxy의 쿠키 세션 갱신, 서버 사용자 검증, Today의 사용자 이메일 표시와 로그아웃 코드를 구현했다. 인증되지 않은 `/` 요청은 `/login`으로 이동하며 `/MASTER_PLAN.html`은 공개 경로로 보존한다.

사용자가 제공한 실제 URL·publishable 공개 키를 `.env.local`에 설정하고 개발 서버를 재시작했다. 실제 Auth에 잘못된 로그인 요청을 보내 HTTP 400 `invalid_credentials`와 화면 오류를 확인했다. `.env.example`에는 빈 변수명만 제공하고 `.env.local`과 환경별 local 파일은 Git에서 제외한다. 설정이 없으면 로그인을 우회하지 않고 연결 준비 안내를 표시한다.

로컬 Chrome 자동화로 로그인 UI·입력 검증·설정 누락 오류·실제 잘못된 로그인 오류·익명 접근 차단·마스터플랜 보존을 확인했고 lint·typecheck·production build가 통과했다. 정상 로그인·사용자 이메일 표시는 사용자 제공 Dashboard 화면으로, F5 후 세션 유지와 로그아웃 후 `/login` 이동 및 `/` 재접근 차단은 사용자 수동 확인으로 검증했다. Auth 1단계 로컬 검증을 완료했으며 자동화가 사용자 세션을 직접 검사한 것으로 기록하지 않는다.

Auth 외 Stage B 기능(users/workspaces/drafts/RLS/Storage), 회원가입·비밀번호 재설정·Google/Threads OAuth, AI API, 실제 예약·게시는 이번 범위에 없다. 기존 운영 데이터와 상호작용은 계속 mock이다. GitHub push·Vercel 배포는 수행하지 않았다.

다음 권장 단계는 **별도 배포 작업으로 Vercel에 공개 환경변수를 설정하고 Auth 변경을 배포해 Production 흐름을 검증하는 것** 하나다. 현재 작업의 로컬 범위에는 포함하지 않으며 이번에는 실행하지 않았다.

## 2026-10-01 — Auth Production 배포 완료

후속 요청의 Auth Production 배포 범위를 완료했다. 공개 환경변수 두 개를 Production에 설정하고 Supabase Site URL을 Production 주소로 저장했다. Auth 커밋 `ef46831`의 main push로 시작된 Vercel 배포가 Ready 상태가 됐다. 기존 계정의 정상 로그인·사용자 이메일 표시와 같은 사용자 창의 새로고침 유지·로그아웃·익명 재접근 차단, 공개 MASTER_PLAN을 실제 Production에서 검증했다. 로컬 최종 세션 흐름 재확인과 lint/typecheck/build도 통과했다.

이번에는 Auth 배포와 검증·설정 정리만 수행했다. 앱 DB·Threads API·AI·새 UI 기능은 추가하지 않았고 운영 데이터는 mock이다. 다음 권장 단계는 **두 사용자의 workspace 접근 권한과 RLS 설계 검토** 하나이며, 이 작업에서는 구현하지 않는다.

## 2026-10-01 — Workspace 접근 / RLS 적용

후속 요청에 따라 설계 파일 준비를 넘어 실제 Supabase의 profiles/workspaces/workspace_members와 RLS까지 적용했다. 확인 완료 A/B 계정을 공동 workspace의 owner/member로 연결하고 기존 Auth를 유지하는 읽기 전용 API를 추가했다. 조회는 실제 사용자 세션의 Data API 요청과 DB 멤버십으로 보호하며 익명·외부 ID·쓰기·역할 승격을 차단한다.

현재 단계는 workspace 권한 기반만 다룬다. 화면의 운영 데이터·workspace 표시는 계속 mock이며 Threads 계정·초안·승인·예약·AI·게시·Storage를 구현하지 않는다. DB 정책, 실제 A/B 로그인 상태의 접근 검사, Auth 회귀와 품질 검사 결과는 `docs/TEST_NOTES.md`에 남긴다. 기존 문서와 MASTER_PLAN을 보존하며 앱 변경의 push/배포는 이번 작업 범위에 포함하지 않는다. workspace/RLS 검증 후 여기서 멈춘다.

## 2026-10-01 — Auth / Workspace / RLS 기반 완료

후속 요청으로 `ebc7716`의 main push와 Vercel Production 배포를 완료했다. 기존 실제 A/B 권한·세션 검사, Supabase RLS 검사와 격리 PostgreSQL 50개 통과 결과를 유지하며 최종 lint/typecheck/build도 다시 통과했다. Production 로그인은 사용자 Chrome에서 확인했고 익명 경로 보호·workspace API 401·공개 마스터플랜은 HTTP로 확인했다. 추가 A/B 수동 재검사는 사용자 지시로 중단했다. 검증의 증거 방식을 `docs/TEST_NOTES.md`에 구분해 기록했다. 다음 작업은 workspace 경계를 적용한 실제 drafts DB CRUD이며 Threads·AI·승인·예약·게시 기능은 아직 진행하지 않는다.
