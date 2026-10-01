# MVP SPEC

## P0
- [x] 이메일 로그인 (Auth 1단계 로컬·Production 검증 완료)
- [ ] 2명 workspace
- [ ] Threads account placeholder
- [x] Today dashboard (mock 첫 화면)
- [ ] Draft CRUD
- [ ] AI draft mock
- [ ] approval status: draft/review/approved
- [ ] schedule datetime
- [ ] queue list
- [ ] Supabase persistence
- [x] mobile layout (Today mock 화면)

## P1
- [ ] Meta Threads OAuth
- [ ] text publish
- [ ] image publish
- [ ] publish result/error log
- [ ] long-lived token lifecycle
- [ ] insights import
- [ ] simple analytics

## P2
- [ ] video/carousel
- [ ] replies
- [ ] style profile
- [ ] similarity/duplicate detection
- [ ] Viral Lab
- [ ] notifications
- [ ] PWA

## Out of scope first
- 브라우저 쿠키 복사
- 탐지 회피 자동화
- 대량 무승인 자동게시
- 타인의 콘텐츠 복제

## 2026-10-01 — Today mock 프로토타입 범위

`/`에 Next.js App Router 기반 Today Dashboard 첫 화면을 구현한다. 두 운영자의 계정 표시, 오늘 예약·승인 대기·게시 완료·오류 요약과 운영 큐는 mock data를 사용한다. 계정 표시는 연결되지 않은 데모 placeholder이며 OAuth나 Threads 연결 완료를 의미하지 않는다.

Today 화면에서 제공하는 상태 변경은 UI 데모이며 Draft CRUD, 영속 승인 이력, 실제 예약 작업, Supabase persistence 완료로 계산하지 않는다. 새로고침하면 초기 mock 상태로 돌아간다. Today dashboard와 mobile layout은 로컬 Chrome 브라우저 검증을 완료했다. 나머지 P0 기능은 별도 구현 단계로 유지한다.

데모 기준일은 한국 시간 `2026-10-01`이며 초기 현황은 예약 8건·승인 대기 3건·게시 완료 4건·오류 0건이다. 계정 필터, 상태별 큐 보기, 큐 펼치기, `Mock 승인`의 메모리 상태 변경, 주제별 템플릿 초안 5개 미리보기를 제공한다. 이 동작은 전체 Draft CRUD·AI·Approval·Queue 기능의 P0 완료를 의미하지 않는다. 메뉴는 첫 화면 내 섹션으로 이동한다.

`MASTER_PLAN.html`과 모든 기존 문서를 보존한다. `/MASTER_PLAN.html`은 원본의 정적 사본을 제공하며 Next.js 개발·빌드 실행 시 원본에서 동기화한다. 실제 로그인·워크스페이스 권한·AI·Supabase·Threads API는 이 단계에 포함하지 않는다.

## 2026-10-01 — Auth 1단계 현재 상태

이메일/비밀번호 로그인 → `/` → 서버 확인 사용자 이메일 표시 → 현재 세션 로그아웃 → `/login` 흐름의 코드를 준비했다. SSR 쿠키 저장과 Proxy 갱신으로 새로고침 시 세션을 읽고, 세션이 없으면 `/`를 차단한다. 회원가입·비밀번호 재설정·외부 OAuth UI는 제공하지 않는다.

실제 Supabase URL·publishable 공개 키를 Git에서 제외된 `.env.local`에 설정했다. 잘못된 로그인 요청의 HTTP 400 `invalid_credentials`와 화면 오류를 로컬 Chrome에서 확인했다. 로그인 화면·입력 검증·설정 누락 오류·익명 접근 차단·공개 마스터플랜도 확인했으며 lint/typecheck/build가 통과했다. 사용자 제공 화면으로 실제 로그인·이메일 표시를 확인했고, F5 후 로그인 유지와 로그아웃 → `/login` 이동 및 이후 `/` 직접 접근 차단은 사용자 수동 확인으로 검증했다. 이메일 로그인 P0의 Auth 1단계 로컬 범위를 완료 처리한다. Production에는 배포하지 않았다.

workspace·Threads 계정·draft·승인·큐·수치는 기존 mock으로 유지한다. DB·Storage·AI·Threads API·실제 예약/게시 기능은 구현하지 않았다.

후속 Production 배포 완료: `https://threads-duo-os.vercel.app`에서 기존 테스트 계정 로그인·Dashboard 이메일·새로고침 유지·로그아웃·익명 접근 차단을 확인했다. `/MASTER_PLAN.html`도 원본 내용으로 제공한다. 공개 설정은 URL·publishable 키 두 변수만 사용한다. 다른 P0 기능의 완료 상태는 바꾸지 않는다.
