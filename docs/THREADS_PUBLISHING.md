# Threads 텍스트 수동 게시 1단계

승인(`status=approved`)되고 `scheduled_at`이 저장된 활성 글만 Dashboard의 **지금 게시**로 실행한다. 예약시간은 유지하며 미래 예약도 수동 버튼을 누른 시점에 게시한다. 본문을 그대로 보내며 자동 잘라내기, 제목 합치기, 미디어, Cron, AI, 분석, OAuth callback은 추가하지 않는다.

## 연결 준비

현재 프로젝트에는 Threads access token이 없다. 실제 외부 게시 성공은 아직 확인하지 않았다. 코드/DB가 준비됐다는 사실과 외부 게시 완료를 구분한다.

1. [Meta 개발자 Dashboard](https://developers.facebook.com/apps/)에서 Threads API 사용 사례가 있는 앱을 준비한다. 앱에서 게시할 Threads 계정이 개발/테스트 권한을 갖도록 설정하고 해당 계정에서 필요한 초대를 수락한다.
2. 해당 계정의 **Threads User Access Token**을 준비한다. 필요한 권한은 `threads_basic`, `threads_content_publish` 두 개다. Facebook/Instagram token, App token으로 대체하지 않는다. 만료/권한은 Meta Access Token Debugger에서 확인한다. 가능한 장기 토큰을 사용하고 만료 시 운영자가 교체한다. 자동 갱신은 이번 범위에 없다.
3. 로컬 `.env.local`에 `THREADS_ACCESS_TOKEN`을 넣는다. `THREADS_WORKSPACE_ID`, `THREADS_PUBLISHING_SECRET`은 로컬에 이미 준비했으며 실제 Supabase에는 같은 secret의 SHA256 digest만 적용했다. 이 두 값은 그대로 사용한다. token/secret을 채팅·MD·Git에 붙여 넣지 않는다.
4. Vercel Dashboard → `threads-duo-os` → Settings → Environment Variables에서 **Production** 범위에 `THREADS_ACCESS_TOKEN`, `THREADS_WORKSPACE_ID`, `THREADS_PUBLISHING_SECRET`을 설정한다. workspace와 secret은 로컬 `.env.local`의 동일 값을 복사한다. 새로운 다른 secret을 임의로 생성하면 DB 확인에 실패한다. 환경변수 설정 후 최신 배포를 Redeploy한다.
5. 기존 owner 세션의 Dashboard에서 **Threads 계정 연결**을 누르면 서버 `/me`로 확인한 사용자 ID/username을 metadata로 저장한다. 준비된 approved+scheduled 글의 본문과 표시된 대상 계정을 확인하고 **지금 게시**를 누른다. 성공 시 게시 ID/시각과 게시완료 건수를 표시한다. 기존 session으로 실행하며 추가 Auth 테스트는 필요하지 않다.

별도의 Meta App Secret, Supabase service-role 키를 앱에 추가하지 않는다. `.env.example`에는 위 변수명이 값 없이 있으며 `.env.local`은 Git 제외다. 이번 Vercel connector는 환경변수 쓰기 도구를 제공하지 않으므로 Threads 자격증명 설정 완료를 자동으로 주장할 수 없다.

## 공식 API 확인 근거 (2026-10-01)

[Meta 공식 API 컬렉션](https://www.postman.com/meta/threads/documentation/dht3nzz/threads-api)과 [현재 Meta 공식 샘플 소스](https://github.com/fbsamples/threads_api/blob/main/src/index.js)를 확인했다. Meta 개발자 문서 직접 접근은 429로 제한돼 공식 컬렉션/소스를 대조했다. host는 현재 샘플의 `https://graph.threads.com`을 중앙 상수로 사용한다. [공식 버전 설정](https://github.com/fbsamples/threads_api/blob/main/.env.template)에 따라 임의의 과거 버전을 강제하지 않고 Meta App 기본 API 버전을 사용한다.

- GET `/me?fields=id,username`: 연결 계정 확인. 게시 직전에도 서버 토큰 주체가 저장된 계정과 같은지 확인한다.
- POST `/{threads_user_id}/threads?media_type=TEXT&text=...`: 컨테이너 생성. `auto_publish_text`를 지정하지 않아 즉시 외부 게시가 발생하지 않게 한다.
- GET `/{container_id}?fields=id,status`: FINISHED 준비 확인 후에만 게시한다. IN_PROGRESS는 최대 8회/30초 준비 예산 안에서 조회한다.
- POST `/{threads_user_id}/threads_publish?creation_id=...`: 게시 ID를 받는다. Meta POST를 자동 재시도하지 않는다.
- Authorization Bearer header, HTTPS 고정 host, redirect 거절, no-store, 요청 timeout을 적용한다. 필요한 게시 권한만 사용한다. Threads의 본문/링크 제한은 Meta가 검증하며 실패 시 저장한다.

## DB와 중복 게시 경계

적용 migration: `20261001110343_threads_text_publishing.sql`.

`threads_accounts(id,workspace_id,threads_user_id,username,connected_by,connected_at)`은 workspace별 한 계정을 저장한다. 멤버 SELECT만 허용한다. owner만 서버 검증 계정을 연결할 수 있고 기존 목적지를 다른 계정으로 바꾸는 동작은 거절한다.

`drafts.status`는 승인 이력과 기존 기능을 위해 draft/pending/approved를 유지한다. 새 `publication_status`는 unpublished/publishing/published/failed다. 추가 결과 필드는 threads_account_id, threads_container_id, threads_post_id, published_at, publish_error, publish_attempt_id, publish_started_at, publish_retryable이다. Dashboard 게시 상태와 숫자는 publication_status를 사용한다. 예약 목록은 unpublished만 포함해 게시완료/오류를 예약 건수에 중복 집계하지 않는다.

public invoker RPC → private definer는 현재 멤버십 + 서버 secret digest를 동시에 검증한다. `private.threads_publishing_config`의 secret digest는 RLS/무정책/권한 회수로 client 읽기를 막는다. 원문 secret/token은 저장하지 않는다. secret 값은 운영자가 환경변수에 공급하고 digest provisioning은 별도 관리자 작업이다. secret 교체 시 환경변수와 해당 hash를 같이 갱신해야 한다.

FOR UPDATE/expected_updated_at 조건으로 claim을 하나만 만들고 컨테이너를 먼저 저장한다. 완료/오류 RPC는 동일 attempt_id만 허용한다. 게시 중/완료 또는 결과 불확실 상태의 내용·승인·예약·삭제 변경은 거절한다. 새 글은 기존 작성 흐름으로 만들 수 있다.

명확한 실패는 failed + 일반화한 HTTP/code 오류 + 수동 재시도 가능으로 저장한다. 게시 POST timeout/5xx/잘못된 결과는 failed + 재시도 불가로 저장한다. **불확실한 결과는 Threads에서 실제 게시 여부를 확인하기 전 다시 실행하지 않는다.** 외부 게시 성공 후 DB 저장 실패는 publishing 잠금을 유지하고 성공 ID를 오류 안내에 표시한다. 동일 성공 결과 DB 저장만 최대 3회 시도하고 외부 게시 POST는 반복하지 않는다. 이 미결과는 운영자가 실제 Threads/컨테이너와 대조해 복구해야 한다. 자동 재시도/자동 복구 엔진은 추가하지 않았다.

## 검증 범위

`node scripts/test-threads-publishing.mjs`: 격리 Postgres 실제 migration/RPC + 모의 Meta transport로 생성→준비→게시→DB 결과, 게시 ID/시간 재조회, 실패/민감 오류 제거, 중복 claim, 불확실 응답 재시도 차단을 검사한다. 실제 Supabase에서도 새 RPC 성공 필드 경로를 단일 rollback fixture로 확인했다. 모두 외부 게시 성공의 증거는 아니다.

기존 Auth/Workspace/Draft CRUD/승인 이력/예약 테스트나 A/B 로그인 검사를 반복하지 않는다. 실제 Meta token을 연결한 후 글 하나의 게시 성공이 이 단계의 최종 완료 조건이다.
