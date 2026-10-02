# 게시 운영 안정화 — 2026-10-02

## 사용 흐름

Composer 또는 Queue의 **게시 시뮬레이션 열기 → 게시 준비 검사**는 읽기 전용이다. 본문/예약/중복/카테고리/작업 잠금/계정/권한/토큰을 확인한다. Meta credential이 없으면 **Meta 연결 필요**이며 실제 게시를 실행하지 않는다.

**TEST pipeline 실행**은 사용자 명시적 작업이다. 저장/claim/처리 이력은 실제 DB에 기록하지만 Meta HTTP 요청은 전혀 하지 않는다. 성공은 **Test Publish Completed · 미게시**이며 실제 Post ID, published_at, Insights와 외부 성과 숫자를 만들지 않는다. 성공/일시 오류/권한 오류/불확실 응답 시나리오를 선택한다. TEST 저장+claim은 하나의 트랜잭션이라 LIVE worker와 경합해 외부 게시를 일으킬 수 없다.

Queue에서 Retry/Needs Attention/취소/TEST 필터를 선택하고 retry count·다음 시간·마지막 오류를 본다. 안전한 실패만 Composer 편집/취소/수동 실행이 가능하다. 실제 게시가 불확실한 작업은 잠금을 유지하며 Threads에서 결과 확인 전 수동 재시도도 허용하지 않는다. History/Queue의 **처리 이력 보기**는 클릭할 때만 해당 draft의 시간순 이력을 읽는다. 도입 이전 이력을 추정해 만들지 않는다.

## 기존 작업과 엔진 재사용

- Job은 기존 `drafts` 행이다. 중복 job 테이블은 없다. 승인 상태와 게시 상태를 분리해 유지한다.
- `publish_job_id`: unique UUID, 같은 retry 동안 유지. 안전한 내용/예약/계정 변경은 새로운 게시 의도로 키를 교체한다. 이 키는 앱 DB의 실행 키이며 Meta 자체의 exactly-once 보장을 뜻하지 않는다.
- `publish_attempt_id`: 실행마다 새 UUID. row lock + expectedUpdatedAt + 단일 claim으로 버튼/worker 경합을 차단한다. 이미 Published인 행은 claim하지 않는다.
- `publish_lease_until`: 10분. processing이고 container가 없을 때만 안전하게 재시도한다. container 생성 이후 또는 최종 요청 결과가 불확실한 stale은 Needs Attention으로 이동하되 claim/편집 잠금을 유지한다. 같은 attempt의 늦은 확정 Post ID 저장은 허용한다.
- 일시 오류에만 1/5/15분 후 세 번 retry. 영구 인증/권한/콘텐츠 오류, 불확실한 최종 응답과 한도 초과는 Needs Attention이다. 같은 retry의 키는 유지한다.
- 기존 Supabase 매분 Cron→Vercel worker를 유지한다. stale 회수→TEST due retry→기존 Meta maintenance/real publisher 순서다. 실제 selector는 TEST를 제외하며 due time→created_at→id 순이다. Published/Cancelled/processing과 아직 이르거나 attention인 retry는 제외한다.
- `publish_job_events`: workspace/draft/job/attempt/actor/from/to/mode/simulated/retry/error summary/time. DB trigger만 append하고 멤버 SELECT RLS를 적용한다. actor가 없는 Cron의 lease 복구는 system 작업이다.

## TEST와 LIVE

Accounts의 기존 계정별 TEST/LIVE 설정을 유지한다. 연결된 TEST는 Meta container 준비 후 최종 게시를 생략한다. 이번 credential 없는 simulation은 같은 DB 단계만 수행한다. LIVE 전환은 기존 토큰/게시 권한/만료 검증을 요구한다. 시뮬레이션 실패 retry가 실제 Meta worker로 넘어가지 않는다. 실제 연결 후 TEST 완료 글을 편집/재예약하거나 명시적 실제 게시로 실행할 수 있다.

## Insights

확정 LIVE Post ID를 저장한 기존 trigger가 +1/6/24/72/168시간 checkpoint를 만든다. simulation은 collector job도 만들지 않는다. `ThreadsInsightsClient`가 기존 Meta transport를 감싸 post/account 수집을 격리한다.

Snapshot은 실제 API 숫자만 저장한다. `available_metrics`는 non-NULL 항목, `collection_status`는 collected/partial/unavailable, 미지원 값은 NULL, 실제 API 0은 0이다. `threads_post_id`, `error_code`, 기존 fetched_at/after_hours를 함께 저장한다. Collector completion은 유효 lease와 동일 attempt 번호를 확인하므로 늦은 응답이 새 claim을 완료할 수 없다. 내부 운영 집계는 simulation을 제외하고 외부 Analytics의 연결 대기/Unavailable 표시는 유지한다.

Meta 보안 제한 해제 후 서버 App ID/Secret 설정 → Accounts OAuth → TEST → LIVE → 실제 게시 1건 → Queue 3건을 진행한다. Insights는 Accounts의 별도 **게시 + Insights 연결**로 `threads_manage_insights`를 허용하면 기존 worker가 수집한다. 이 권한은 일반 게시 연결에 강제하지 않는다. [Meta 공식 Authorization 안내](https://www.postman.com/meta/threads/folder/34203612-e0373e84-de6b-46f1-b90d-3fea76ba6782).

## 검사와 성능 경계

`node scripts/test-publish-operations.mjs`: 격리 PostgreSQL에서 원자적 저장 rollback, 동시 claim 차단, 키/시간순 이력, 재시도 1/5/15분·한도, 영구/불확실 격리, safe/uncertain stale 복구, 취소, Post ID 이후 5 checkpoint·collector fencing·NULL/0 구분을 확인했다. Meta HTTP는 호출하지 않는다. lint/typecheck/production build 통과. 실제 Supabase migration 적용 후 기존 글 보존·신규 스키마·Scheduler heartbeat와 외부 snapshot 0건을 확인했다.

Persistent layout/provider/link/prefetch는 변경하지 않았다. TEST/취소 결과는 draft resource만 교체한다. Timeline은 draft ID+수정 버전별 shared read cache에 저장하며 Accounts/Templates 등은 무효화하지 않는다. router.refresh/global cache flush는 추가하지 않았다. 기존 navigation 측정값을 이번 새 측정으로 주장하지 않는다.

Supabase advisor의 private credential/collector 테이블 무정책 INFO는 의도적 client 차단이다. 기존 [Auth leaked-password 보호 안내](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection)는 이번 기능에서 변경하지 않는다.
