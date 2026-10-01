# MVP SPEC

## P0
- [ ] 이메일 로그인
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
