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

다음 최소 P0 단계는 Draft CRUD의 로컬 mock 동작이다. DB·외부 API 연결은 별도 단계에서 명세와 권한 경계를 확인한 뒤 진행한다.
