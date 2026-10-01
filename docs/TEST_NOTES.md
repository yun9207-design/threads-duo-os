# TEST NOTES

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
