# PROJECT PLAN — Threads Duo OS

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
