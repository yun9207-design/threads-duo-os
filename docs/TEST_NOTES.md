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
