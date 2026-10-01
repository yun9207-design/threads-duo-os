# SECURITY

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
