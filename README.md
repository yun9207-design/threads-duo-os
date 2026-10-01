# Threads Duo OS

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

### 현재 범위

Supabase, Threads API, OAuth, 실제 AI 생성, 실제 게시·예약 작업은 연결하지 않는다. 로그인과 DB 저장도 아직 구현하지 않는다. 화면의 상태 변경은 브라우저 메모리에서만 유지되며 새로고침하면 초기 mock data로 돌아간다. 계정, 게시물, 수치와 시간은 예시 데이터다.

### 검증 결과

lint·TypeScript·프로덕션 빌드가 통과했다. 개발·프로덕션 로컬 서버에서 `/`와 `/MASTER_PLAN.html` 모두 HTTP 200과 Chrome 렌더링을 확인했다. 계정 필터·mock 승인·템플릿 5개 미리보기, 390px·320px 모바일과 기존 마스터플랜 탭·데모도 검증했다. 마스터플랜 원본·사본·HTTP 본문은 작업 전 SHA256과 일치한다. 상세 기록과 스크린샷은 [TEST_NOTES](docs/TEST_NOTES.md)에 있다.

### Git 저장소 구조

기존 GitHub 업로드는 `threads-duo-os/` 아래 기획 문서만 포함했다. 이 기존 폴더와 문서는 그대로 보존한다. 실행 가능한 Next.js 앱과 갱신한 문서는 저장소 루트에 두어 Vercel의 루트 빌드 대상이 되도록 한다. 루트 `MASTER_PLAN.html`이 정적 사본 동기화의 기준이다.
