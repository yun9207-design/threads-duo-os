# MVP SPEC

현재 추가 범위는 승인·예약된 텍스트의 수동 실제 Threads 게시다. 서버 토큰과 계정 metadata, DB 시도 잠금/결과 저장, Dashboard 게시완료·게시오류 수치를 구현했다. Meta 연결 및 실제 글 1개 성공 확인은 credential 설정 전까지 미완료다. 기존 기능의 반복 로그인/RLS 검증은 수행하지 않았다.

최신 추가 범위는 **Scheduling 1단계**다. approved 글만 미래 예약시간을 저장·수정·취소할 수 있으며 Dashboard에 시간순 목록과 KST 오늘/내일 이후 건수를 표시한다. DB에 저장된 예약은 새로고침 후 유지된다. 실제 게시 작업자/Threads API는 없다. 상세는 `docs/SCHEDULING.md`를 따른다.

최신 추가 범위는 Draft 승인 이력이다. 실제 상태 변경마다 변경자·이전/새 상태·시간·선택적 메모를 저장하고 기존 편집 카드에서 시간순으로 조회한다. 기존 CRUD와 기반 인증/권한을 보존한다. 아래는 이전 CRUD 단계의 완료 기록이며 최신 이력 구조는 `docs/APPROVAL_HISTORY.md`를 따른다.

현재 추가 구현은 Drafts의 작성·조회·수정·soft delete와 draft/pending/approved 상태 저장이다. Dashboard의 글 목록·건수·승인 대기 카드가 실제 DB 조회를 사용하며 mock fallback은 없다. workspace 이름/역할은 기존 읽기 기반을 재사용한다. 기존 Auth/Session/Workspace/RLS와 MASTER_PLAN은 유지한다. 실제 Supabase 적용과 기존 세션의 브라우저 CRUD·새로고침 유지·관리자 복구·외부 workspace 차단 및 lint/type/build를 통과해 Draft CRUD를 완료 처리했다. 최신 상태는 `docs/DRAFTS.md`를 기준으로 한다. 승인 이력·Threads·AI·예약·게시·Analytics·결제는 이번 범위가 아니다.

## P0
- [x] 이메일 로그인 (Auth 1단계 로컬·Production 검증 완료)
- [x] 2명 workspace (profiles/멤버십/RLS·조회 API, Dashboard 실제 이름/역할)
- [ ] Threads account placeholder
- [x] Today dashboard (실제 Drafts 목록·건수·편집)
- [x] Draft CRUD (실제 Supabase·soft delete)
- [ ] AI draft mock
- [x] approval status: draft/pending/approved (상태 저장만, 승인 이력 없음)
- [x] Approval History (변경자/상태 전환/시간/선택 메모, 멤버 전용 조회)
- [x] schedule datetime (approved 글만 저장·수정·취소, 실제 DB 적용)
- [x] queue list (예약시간 목록만, 실행 큐/자동 게시 없음)
- [x] Supabase persistence (Drafts 범위)
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

## 2026-10-01 — Workspace / RLS 기반

실제 Supabase에 profiles·workspaces·workspace_members를 생성하고, 공동 workspace에 A(owner)/B(member) 두 사용자 멤버십을 준비했다. 가입 workspace 및 멤버 프로필/멤버십 조회만 허용하는 RLS와 읽기 API를 구현했다. 익명 조회·외부 workspace ID·쓰기·역할 승격은 차단한다. 실제 데이터 접근과 기존 Auth 회귀 검증 결과는 `docs/TEST_NOTES.md`에 기록한다.

이번 범위는 권한 기반까지만 완료한다. 회원 초대·workspace 생성/전환 UI·역할 관리 UI는 없으며 기존 Dashboard는 보존한다. Threads 계정·콘텐츠·초안·승인·예약 큐·운영 수치는 계속 mock이다. Draft CRUD, Storage, AI, OAuth와 실제 예약/게시의 완료 상태는 변경하지 않는다. 앱 변경은 로컬 검증 상태이며 이번에는 추가 Production 배포를 하지 않는다.

후속 배포 완료: workspace/RLS commit `ebc7716` main push 및 Vercel Production 배포가 완료됐다. 기존 A/B·RLS 50개 결과와 최종 품질 검사, Production 로그인 사용자 확인/익명 HTTP smoke를 근거로 두 사용자 workspace 권한 기반을 완료 처리한다. 추가 A/B 수동 로그인 반복은 사용자 요청으로 중단한다. 다음 구현 범위는 실제 drafts DB CRUD이며 기타 콘텐츠 기능의 완료 상태는 바꾸지 않는다.
