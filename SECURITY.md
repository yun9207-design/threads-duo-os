# SECURITY

## Threads Pro P0 추가 경계

새 페이지는 기존 서버 인증/workspace 조회를 재사용한다. 사용자 작성 요청은 same-origin JSON과 기존 멤버 RLS/버전 잠금을 유지한다. 신규 일괄 등록만 최대 128KB, 30개, 각 500자로 제한하며 기존 단일 CRUD의 32KB 한도는 유지한다. 계정/workspace 복합 FK로 다른 게시 계정 연결을 거절한다. 중복 본문 검사는 workspace별 transaction lock 안에서 처리하며 사용자가 중복을 명시적으로 확인할 수 있다.

예약 실행기의 별도 capability는 workspace 한 개의 due-only claim 및 해당 게시 시도 결과 저장으로 제한한다. Auth 우회 세션이나 service-role key를 사용하지 않는다. Cron은 private dispatch 함수와 암호화 Vault를 사용하며 사용자 계속 지시 및 자동 승인 검토 허용 후 Production 호출을 설정했다. Meta 토큰은 계속 Vercel의 server 환경변수에서만 읽는다. 브라우저에는 토큰 입력란/비밀값/worker key를 제공하지 않는다. `net`/`vault` schema는 Data API에 절대 노출하지 않는다. 관리 extension의 내부 SQL PUBLIC grants를 postgres로 회수할 수 없으므로 API schema 경계가 필수다. 숨김은 결과를 삭제하지 않으며 재표시 가능하다. 불확실한 게시 결과는 계속 재시도 차단한다. 아래 기존 보안 원칙은 보존한다.

Threads 게시 추가 경계: access token과 게시 결과 쓰기용 secret은 server-only 모듈의 환경변수에서만 읽고 NEXT_PUBLIC prefix를 사용하지 않는다. Supabase service-role/secret key는 사용하지 않는다. 빈 search_path의 private definer가 현재 auth.uid 멤버십과 서버 secret digest를 모두 검사하고 public invoker wrapper가 좁은 게시 연산만 제공한다. 브라우저는 게시 결과를 위조하거나 계정 metadata를 직접 변경할 수 없다. Bearer header로 Meta에 토큰을 전달하며 URL/응답/로그에 토큰을 포함하지 않고 외부 redirect를 거절한다. provider 오류 원문을 저장하지 않는다. 원자적 DB claim으로 중복 게시를 막고 실제 게시 응답이 불확실하면 수동 재시도도 차단한다. 서버 env 자격증명이 없는 동안 실제 외부 게시를 하지 않는다. 기존 보안 기록은 아래 보존한다.

## Scheduling 1단계 추가 경계

기존 Auth/Workspace/RLS를 유지하고 scheduled_at UPDATE 열만 허용한다. 서버는 기존 사용자·멤버십·버전 조건을 사용하며 DB CHECK/SECURITY INVOKER trigger가 직접 Data API에서도 활성 approved 및 새 예약의 미래 시각 조건을 강제한다. 신규 API는 기존 same-origin JSON/private-no-store를 재사용하며 상태/identity 필드 입력을 허용하지 않는다. 비밀키·새 환경변수·게시 권한·외부 API 호출은 추가하지 않았다. 상세는 `docs/SCHEDULING.md`를 따른다.

## Approval History 추가 경계

이력은 멤버 SELECT만 허용하고 클라이언트 INSERT/UPDATE/DELETE는 금지한다. 변경자 ID는 auth.uid에서 결정한다. private 기록 trigger의 제한된 SECURITY DEFINER는 비어 있는 search_path, 명시적 사용자/멤버십 검사, 직접 EXECUTE 금지로 보호한다. 메모 전달 RPC는 SECURITY INVOKER로 기존 drafts RLS·열 권한·버전 조건을 유지한다. React는 메모를 텍스트로 표시한다. 공개/secret key 및 기존 Auth/Workspace 정책은 변경하지 않았다. 상세는 `docs/APPROVAL_HISTORY.md`를 따른다.

## Drafts 추가 경계

기존 Auth/Session/Workspace 정책은 동결한다. Drafts만 workspace 멤버 SELECT/UPDATE, 본인 작성 INSERT를 허용한다. 열 권한과 identity trigger로 workspace/작성자/ID/작성일 변경을 막는다. 작성자 ID는 서버 검증 사용자로 결정하며 API 입력의 identity/추가 필드는 거절한다. 익명과 다른 workspace는 DB RLS에서도 차단한다. 저장 상태값 approved는 외부 게시 권한을 부여하지 않는다.

API mutation은 같은 Origin/Host의 JSON(32KB 이하)을 요구하고, 수정/삭제는 expectedUpdatedAt 조건으로 동시 편집 덮어쓰기를 거절한다. 모든 글 응답은 private/no-store이며 React에서 주제·본문을 텍스트로 렌더링한다. 삭제는 deleted_at을 기록하며 삭제 행도 같은 workspace 멤버에게는 Data API 조회 가능하다. 관리자 복구 외 물리 DELETE/UI 복구 기능은 제공하지 않는다. 새 키나 service-role/secret을 추가하지 않는다. 상세 스키마/적용 상태는 `docs/DRAFTS.md`에 있다.

1. Meta App Secret와 Threads access token은 서버에서만 처리.
2. .env.local은 gitignore.
3. 브라우저 localStorage에 access token 장기 저장 금지.
4. Supabase RLS로 workspace 경계를 강제.
5. 게시 endpoint는 approved draft만 허용.
6. 예약 job은 idempotency key로 중복게시 방지.
7. 로그에 access token/app secret/AI key 기록 금지.
8. 초기 테스트는 서브 Threads 계정.
9. 자동게시 실패 시 제한된 재시도 + 사람 확인.

## 2026-10-01 — Supabase Auth 1단계

- URL과 publishable 공개 키만 `.env.local`에서 읽는다. legacy anon 대체 설정은 제거하고 공개 키 변수 하나로 통일한다. `SUPABASE_SERVICE_ROLE_KEY`나 secret key를 사용하지 않는다. `NEXT_PUBLIC_` 값은 브라우저에 포함되므로 권한이 높은 키·비밀번호·사용자 토큰을 넣지 않는다.
- `.env.local`과 `.env*.local`은 Git에서 제외한다. `.env.example`에는 비어 있는 변수명만 기록한다. 인증 정보는 코드·MD·스크린샷·로그에 기록하지 않는다.
- `@supabase/ssr`의 쿠키 저장을 사용하고 토큰을 별도로 localStorage에 저장하지 않는다. 쿠키는 SameSite=Lax와 Path=/를 사용하며 HTTPS 요청에서는 Secure를 설정한다.
- 서버 클라이언트는 매 요청 새로 만든다. Proxy는 `getClaims()`로 토큰을 검증/갱신하고, 페이지는 `getUser()`로 서버 확인 사용자를 읽는다. `getSession()`의 쿠키 사용자 객체만으로 접근을 허용하지 않는다.
- 인증 페이지는 동적 렌더링한다. Proxy는 쿠키 갱신·삭제를 요청과 응답에 반영하고, redirect에도 갱신 쿠키를 보존하며 인증 응답의 공유 캐시를 막는다.
- 공개 키 설정이 없거나 세션 확인에 실패하면 `/`는 `/login`으로 이동한다. 데모 우회 계정·가짜 토큰·하드코딩 키는 제공하지 않는다. 로그인 실패는 일반적인 메시지로 표시하며 비밀번호·SDK 응답·토큰을 로그에 출력하지 않는다.
- 로그아웃은 `scope: "local"`로 현재 세션을 종료한 뒤 전체 페이지 이동으로 이전 인증 화면 캐시를 버린다. `/MASTER_PLAN.html`과 정적 자산은 공개 경로로 유지한다.
- Auth 로그인은 workspace 권한이나 DB RLS 구현 완료를 의미하지 않는다. 이번 단계에는 애플리케이션 테이블 조회/수정·RLS migration·Storage·Threads API가 없다.

Production 배포에서는 위 두 공개 변수를 Production 범위에만 설정했다. 실제 값은 Git·문서에 기록하지 않았다. Supabase Site URL은 Production HTTPS 주소이며 별도 callback·OAuth·와일드카드 redirect는 추가하지 않았다. 실제 사용자 비밀번호 입력은 사용자가 직접 수행했고, 자동화 검증에서도 비밀번호·세션 토큰·쿠키 값을 읽거나 복사하지 않았다. Production 인증 응답의 `private`, `no-store`와 로그아웃 후 루트 차단을 확인했다.

## 2026-10-01 — Workspace / RLS

- 실제 `profiles`, `workspaces`, `workspace_members`에 RLS를 적용했다. `auth.uid()`의 DB 멤버십으로 접근을 결정하며 변경 가능한 사용자 metadata나 클라이언트가 지정한 사용자 ID를 신뢰하지 않는다.
- 기본 PUBLIC/anon/authenticated 테이블 권한을 회수하고 authenticated SELECT만 부여한다. owner/member 모두 앱에서 멤버를 추가하거나 역할을 변경할 수 없다. INSERT/UPDATE/DELETE 정책·앱 RPC·초대 기능은 제공하지 않는다.
- 자기 프로필과 공동 workspace 멤버의 표시 정보만 읽을 수 있다. profiles에 이메일·비밀번호·토큰을 복제하지 않는다. workspace마다 별도 멤버십과 역할을 유지한다.
- 정책 재귀를 피하는 두 읽기 helper는 비노출 `private` 스키마에 둔다. postgres 소유 SECURITY DEFINER, 빈 search_path, 명시적 스키마, PUBLIC/anon 실행 권한 회수와 authenticated 실행 권한을 적용한다. 임의의 사용자 ID로 접근 주체를 바꾸거나 데이터를 쓰는 함수는 없다.
- `GET /api/workspaces`와 ID 상세 API는 요청별 서버 클라이언트·서버 확인 사용자·실제 사용자 세션을 사용한다. 권한이 높은 키는 추가하지 않았다. 익명 401, 외부/없는 ID는 동일한 404이며 DB 오류 세부 사항은 노출하지 않는다. 응답은 `private, no-store`와 `Vary: Cookie`를 사용한다.
- DB 멤버십을 매 조회에 확인하므로 권한 해제가 오래된 JWT metadata에 남지 않는다. 기존 Auth 클라이언트·로그인/로그아웃 동작과 Dashboard는 보존하며 자동 Auth trigger를 추가하지 않는다.
- 실제 DB 테스트의 임시 멤버십 제거는 한 트랜잭션에서 ROLLBACK한다. 계정 비밀번호는 사용자가 직접 입력하고 테스트에서 키·세션 토큰·쿠키 값을 출력하거나 추출하지 않는다. 각 workspace의 운영 콘텐츠는 아직 mock이며 미래 테이블은 자체 RLS를 별도로 구현해야 한다.

상세 권한 범위와 현재 제약은 `docs/WORKSPACE_ACCESS.md`에 기록한다. 현재 앱의 workspace 접근은 조회 전용이고 데이터 생성·멤버 관리·소유권 이전은 관리자 SQL 운영으로 제한한다.
