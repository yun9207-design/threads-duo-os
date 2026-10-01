# Threads Pro P0 사용 안내

기존 Auth/workspace/게시 엔진을 사용하는 운영 제품 화면이다. 계정 하나를 현재 Duo workspace의 멤버들이 함께 사용한다. OAuth, 다중 Threads 계정, AI와 성과 분석은 이 단계에 추가하지 않는다.

| 화면 | 실제 동작 |
| --- | --- |
| `/` | 오늘 게시/대기 예약/전체 성공/실패, 다음 예약, 최근 5개, 실패 경고, 계정·실행기 상태 |
| `/accounts` | 서버 토큰 준비 여부, 연결 metadata, 마지막 확인, owner의 Threads 계정 확인 |
| `/composer` | 500자 텍스트, 실시간 미리보기, 계정 선택, 임시저장/편집/soft delete, 중복 경고, 즉시 게시, KST 예약 |
| `/queue` | 예정 시간 순서와 대기/게시 중/성공/실패, 수정/취소/즉시 게시 |
| `/history` | 결과/시각/본문/Threads ID/오류, 안전한 재시도, 수정 후 재시도, 복사, 숨김·복구 |
| `/bulk` | 1~30개 직접 작성, 개별 편집/시간, 간격으로 일괄 시간 배분, 전체 저장/예약 |

Dashboard/Queue/History는 화면이 보일 때 30초마다 DB 읽기를 갱신한다. 수치는 예시 값을 사용하지 않는다. 기존 MASTER_PLAN은 `/MASTER_PLAN.html`에서 유지한다.

## 작성과 게시

임시저장은 `status=draft`로 저장한다. 즉시 게시/예약 등록은 작성자의 명시적 게시 의도로 `approved`를 저장한다. 기존 승인 이력 trigger와 읽기 UI를 그대로 사용한다. 기존 글의 변경에는 `expectedUpdatedAt`이 필요하다. 중복은 공백을 정규화한 본문 기준으로 경고하며 확인 체크 후 저장 가능하다.

즉시 게시는 기존 컨테이너 생성 → 준비 상태 확인 → 게시 → DB 결과 기록 엔진을 호출한다. 실패해도 이미 저장한 본문을 잃지 않는다. 안전하게 재시도 가능한 실패만 버튼을 활성화한다. 불확실한 외부 결과는 잠금 상태를 유지한다. 성공 글은 편집/재게시하지 않고 새 글로 복사할 수 있다.

예약 취소는 글을 삭제하지 않는다. History 숨김은 성공/실패 결과를 보존하며 ‘숨긴 내역 보기’에서 다시 표시한다. 기존 soft delete는 관리자 복구가 가능한 형태를 유지한다.

## 예약 실행

Supabase Cron/pg_net이 Production의 `POST /api/cron/publish`를 1분 간격으로 호출하도록 구성한다. private dispatch 함수는 Vault에서 workspace별 worker capability를 읽으며 Cron 명령에는 key를 넣지 않는다. [Supabase Cron](https://supabase.com/docs/guides/cron), [예약 HTTP 호출](https://supabase.com/docs/guides/functions/schedule-functions), [Vault](https://supabase.com/docs/guides/database/vault)의 현재 구조를 따른다.

작업자는 `auto_publish=true`, approved, 활성, unpublished, 예정 시간이 지난 글을 시간순으로 한 번에 하나 claim한다. DB row lock과 기존 attempt ID를 재사용해 중복 실행을 막는다. 실패는 History에 남기며 자동으로 반복 재시도하지 않는다. 사용자가 재시도하거나 안전한 실패 글을 수정/재예약해야 한다. 기존 수동 예약은 자동 실행에 포함하지 않는다. 예약 시각은 정확한 초가 아닌 1분 간격의 실행 시작 기준이다.

Meta 토큰이 없으면 실행기는 blocked 상태를 기록하고 claim하지 않는다. 글과 예약은 그대로 보존된다. 기능을 연결한 뒤에는 Vercel에 아래 server 환경변수만 설정한다. 실제 값은 코드/문서/Git에 저장하지 않는다.

- `THREADS_ACCESS_TOKEN`: threads_basic / threads_content_publish 사용자 토큰.
- `THREADS_WORKSPACE_ID`: 게시할 workspace ID.
- `THREADS_PUBLISHING_SECRET`: 기존 private config digest와 일치하는 실행기 capability.

환경변수 적용 후 owner가 Accounts에서 계정 연결을 확인한다. Meta access token이 준비되지 않은 현재 상태에서 외부 게시 성공을 주장하지 않는다. Cron의 기존 인증키 전송 설정은 자동 승인 검토가 별도 승인을 요구해 승인 대기 중이다.

Cron 설치 SQL은 `supabase/pending/queue_dispatch.sql`에 준비되어 있으며 아직 적용하지 않았다. 실제 토큰과 이 설정이 준비되기 전에는 **작성/저장/예약/수정/취소 화면만 사용 가능하며 시간에 따른 자동 외부 게시를 실행하지 않는다.**

## Production 배포

P0 제품 화면을 main에 push했고 Vercel Production 배포가 완료됐다. [Production](https://threads-duo-os.vercel.app/)에서 기존 계정으로 사용한다. 신규 페이지와 stylesheet의 배포를 자동으로 확인했으며 추가 로그인/A-B 검사는 하지 않았다. 새 상태 조회 API의 인증 오류 매핑만 smoke 결과에 맞춰 보완했다. lint/typecheck/Production build가 통과했다.

## 이번 확인

`node scripts/test-pro-product.mjs`는 새 제품 저장/편집/중복 확인, 일괄 예약의 원자성, 큐 수정/취소/명시적 재예약, 즉시 게시의 기존 엔진 연결, due-only worker와 결과 저장, History 숨김/복구를 격리 Postgres에서 확인한다. 실제 Supabase의 새 저장 RPC도 transaction smoke로 확인하고 rollback했다. 기존 Auth/A-B/RLS 전체 검사는 반복하지 않았다.

브라우저는 기존 ProductApp과 로컬 Postgres를 사용하는 격리 preview에서 작성 → 저장 → 예약 → 큐 새로고침 유지 → 수정/취소 → 두 글 시간 배분/전체 예약을 확인했다. Production에 Auth 우회나 preview 경로를 추가하지 않는다. Meta 토큰 미설정 때문에 실제 외부 게시와 재시도 실행은 보류한다.
