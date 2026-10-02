# P3 — Threads LIVE 운영과 성과 피드백

## 구현 및 실제 연결 상태

기존 Publisher/Queue/AI Composer를 이어서 OAuth → TEST/LIVE 게시 → Insights → 성과 분석 → AI 후속 글 → Queue를 구현했다. 실제 Supabase에 아래 다섯 migration을 적용했다. 기존 Auth, workspace, 기존 RLS, MASTER_PLAN은 유지한다.

현재 실제 프로젝트에는 연결된 Threads 계정과 암호화 토큰, 외부 Insights snapshot이 없다. Meta App 설정 전에는 **실제 Threads 게시·예약 자동 게시·실제 Insights 수집 성공으로 간주하지 않는다.** Accounts에 연결 준비와 TEST 상태를 표시하고, 분석 화면은 데이터 부족/Unavailable를 표시한다. 격리 검증의 표본 반응 데이터를 Production에 넣지 않았다.

## Meta 설정

Vercel → threads-duo-os → Settings → Environment Variables → Production에 아래 서버 변수 세 개를 설정하고 재배포한다. 로컬 사용 시 `.env.local`에 동일한 이름을 쓴다. 실제 값은 Git/문서/채팅에 넣지 않는다.

| 변수 | 준비할 값 |
| --- | --- |
| `THREADS_APP_ID` | Meta 앱의 **Threads App ID** |
| `THREADS_APP_SECRET` | 해당 **Threads App Secret**, 서버 전용 |
| `THREADS_REDIRECT_URI` | `https://threads-duo-os.vercel.app/api/threads/oauth/callback` |

Meta 개발자 Dashboard의 Threads API 설정에서도 Redirect Callback URL을 위 주소와 정확히 일치시킨다. 개발 모드에서는 Threads 테스터 초대를 수락한 계정으로 연결하며 일반 사용자 권한은 Meta App Review 요건을 따른다. 이번 연결의 요청 권한은 `threads_basic`, `threads_content_publish` 두 개다. `threads_manage_insights`는 기존 허용 상태를 읽을 수 있지만 게시 연결의 필수 권한이 아니다. 기존 `THREADS_WORKSPACE_ID`, `THREADS_PUBLISHING_SECRET`, Supabase 공개 설정은 유지한다. `THREADS_ACCESS_TOKEN`은 이전 단계 변수이며 P3 엔진은 이 값을 읽지 않고 OAuth credential을 사용한다. 사용자 토큰을 직접 붙여 넣을 필요가 없다.

Accounts에서 owner가 **Threads 계정 연결**을 누르면 Meta 인증 후 같은 화면으로 돌아온다. HTTPS callback, 일회용 서버 state hash, 만료 10분, HttpOnly/Secure/SameSite 쿠키와 현재 owner를 함께 확인한다. 기존 계정과 다른 Threads ID로 바꾸는 재연결은 거절한다. 다중 계정은 후속 범위다.

## Token Manager와 TEST/LIVE

Code를 서버에서 교환해 long-lived token과 만료를 저장한다. 토큰은 workspace별 키와 AAD를 사용하는 AES-256-GCM envelope로 private schema에만 보관한다. 브라우저에는 계정명/권한/시각/상태 metadata만 반환한다. App Secret/원문 토큰을 localStorage나 로그/에러에 넣지 않는다.

기존 서버 capability로 암호화 키를 유도한다. capability 교체 시 기존 envelope를 복원할 수 없으므로 같은 계정으로 다시 연결해야 한다. service-role key는 사용하지 않는다. private credential/state/수집 job은 Data API에 노출하지 않고 직접 조회 권한을 주지 않는다.

연결과 재연결은 항상 **TEST**다. TEST도 컨테이너 생성·준비 확인·결과 저장을 수행하지만 최종 `threads_publish` 전에 멈춘다. 실제 post ID나 Published 수치를 만들지 않는다. TEST 완료 글은 자동 반복하지 않는다. LIVE 전환 후 다시 게시하거나 예약을 수정해야 재진입한다.

owner가 Accounts에서 `LIVE`를 직접 입력해야 전환된다. 연결·만료·기본 정보/게시 권한을 확인한다. LIVE 전환 후 대기 예약은 다음 실행부터 실제 게시 대상이다. 연결 해제 시 credential을 제거하고 TEST로 바꾸며 글과 이력은 보존한다.

### 2026-10-02 — 실제 계정 연결 준비 보완

현재 [Meta 공식 샘플](https://github.com/fbsamples/threads_api/blob/main/src/index.js)의 `https://www.threads.com/oauth/authorize`와 [Meta 공식 API 컬렉션](https://www.postman.com/meta/threads/documentation/dht3nzz/threads-api)의 code 교환/long-lived token 계약을 확인했다. OAuth state·현재 owner·일회용 DB 소비와 AES-GCM private credential 저장, 기존 publisher의 claim/중복 방지는 유지한다. 계정 연결 결과는 안전한 metadata만 반환하며 Accounts는 변경 응답을 즉시 반영한다. 권한 부족은 별도 안내하고 선택 Insights 권한 때문에 Connected/LIVE가 차단되지 않는다.

`20261002030924_threads_publish_permissions.sql`은 기존 연결 함수의 필수 권한만 두 개로 바꾼다. 새로운 DB 컬럼이나 credential 접근 권한은 추가하지 않는다. 계정 캐시는 `connection`으로 분리하고 기존 `live` 갱신은 drafts/worker만 조회한다. Accounts 변경은 Calendar/Planner/History/Templates를 다시 요청하지 않는다. 공통 Layout·prefetch·세션 격리·서버 권한 확인은 유지한다.

Vercel Production에 기존 `.env.local`의 `THREADS_PUBLISHING_SECRET`(Secret)·`THREADS_WORKSPACE_ID`와 정확한 `THREADS_REDIRECT_URI`를 저장했다. Meta 앱 credential 두 개는 아직 로컬/Production에 없다. 실제 계정·토큰·게시 ID는 생성하지 않았으며 연결 완료나 실제 게시 성공으로 주장하지 않는다. 사용자 준비 순서는 다음과 같다.

1. [Meta 개발자 Dashboard](https://developers.facebook.com/apps/)에서 Threads API 사용 사례가 있는 앱을 준비한다.
2. 앱 Dashboard → 앱 설정 → 기본의 **Threads App ID / Threads App secret**을 Vercel 프로젝트 → Settings → Environment Variables → Production의 `THREADS_APP_ID` / `THREADS_APP_SECRET`으로 저장한다. 일반 Facebook App ID와 혼동하지 않는다. Secret은 Secret 타입으로 저장하며 채팅에 보내지 않는다.
3. Threads API 사용 사례 설정의 Redirect Callback URL에 `https://threads-duo-os.vercel.app/api/threads/oauth/callback`을 정확히 등록한다. 개발 모드 계정은 Threads 테스터 초대를 수락하고 기본 정보·게시 권한을 준비한다. localhost URI로 바꾸지 않는다.
4. Vercel 최신 main 배포를 Redeploy한 뒤 Production Accounts에서 연결하고 Meta 권한을 승인한다. Connected 확인 후 LIVE를 활성화한다.
5. Composer에서 `Threads Pro 게시 연결 테스트입니다.`를 즉시 게시로 딱 한 번 실행한다. Threads 실제 계정·History·DB의 post ID가 같은지 확인해야 실제 게시 완료다.

Worker의 유지관리 전용 실행에서 계정/권한/토큰을 확인한다. 유효 토큰의 만료가 7일 이내이고 발급/갱신 후 24시간 이상 지났으면 refresh한다. 정상 확인은 24시간 뒤, 실패는 1시간 뒤 다시 시도한다. 일시 네트워크 오류를 토큰 무효로 단정하지 않는다.

## 기존 엔진과 예약 실행

기존 approved/예약 조건, due selector, processing lock, idempotent 결과 저장을 재사용한다. 동일 item을 여러 worker가 claim하지 못한다. 게시 상태와 승인 상태는 분리된다.

`queued → processing → container_created → publishing → published` 또는 `failed`/`test_completed`를 기록한다. 연결 계정 ID, container/post ID, 요청/완료 시각, 모드, 오류 코드, retry count를 History/Queue에 표시한다.

기존 Supabase Cron이 매분 같은 Vercel worker를 호출한다. 계정/토큰이 없으면 글을 claim하지 않고 연결 필요 상태를 남긴다. LIVE 결과는 기존 Dashboard/Calendar/History에 반영된다.

안전하게 판단할 수 있는 일시 오류만 1분/5분/15분 후 최대 세 번 재시도한다. 영구 오류와 최종 publish 응답이 불확실한 경우 자동 재시도하지 않는다. 게시 후 DB 저장이 지연되면 잠금을 유지해 재게시를 막는다. `Needs Attention`에서 확인한다. 불확실한 외부 결과를 자동으로 성공/실패로 단정하지 않는다.

## Insights와 Analytics

LIVE 게시 결과 저장 시 +1h/+6h/+24h/+72h/+7d 수집 job을 생성한다. 게시가 없는 worker 실행에서 최근 글 우선으로 성숙한 checkpoint를 수집한다. 늦게 실행되면 지나간 checkpoint를 합쳐 최신 시점만 기록하며 과거 값을 꾸며 채우지 않는다. 수집은 10분 간격/lease로 제한하며 일시 실패 재시도도 제한한다.

게시물 `views/likes/replies/reposts/quotes/shares`와 계정 날짜별 `views/likes/replies/reposts/quotes/followers_count`를 별도 snapshot으로 저장한다. metric별 요청으로 한 항목의 미지원이 나머지를 지우지 않게 한다. 미지원/미수집은 NULL + **Unavailable**, API의 실제 0은 0으로 유지한다. 실패 요청에 가짜 snapshot을 만들지 않는다. followers는 수집 시점 값으로 날짜와 `fetched_at`을 함께 표시하며 과거 수를 추정하지 않는다.

기간/계정/카테고리/정렬, 지표별 수집 범위, Top Posts, 카테고리 평균, KST 요일×시간, 계정 일별 값/변화를 제공한다. 계정 Views와 게시물 Views는 다른 API 집계로 분리한다. 조회 범위는 최근 post snapshot 1,000건과 account snapshot 366건 및 기존 게시물 조회 범위이며 한계 도달 시 안내한다.

**Engagement Score는 Threads Pro 내부 점수**다. `likes×1 + replies×3 + reposts×4 + quotes×4`; 가중치는 `lib/threads-performance.ts` 한 곳에서 관리한다. 필요한 지표가 NULL이면 점수를 만들지 않는다. 조회 대비 반응률은 실제 views > 0일 때만 계산한다.

Winning Pattern은 최근 30일 비교 가능한 24h snapshot 전체 10건 이상, 그룹 3건 이상일 때만 제시한다. 계정별 시간 추천도 해당 계정 10건/시간 그룹 3건을 요구한다. 부족하면 **데이터가 더 필요합니다.** 또는 **데이터 수집 중**이다. 관측 비교이며 인과관계/성과 보장이 아니다.

## 성과 기반 AI와 Planner

Top Post의 **이 스타일로 새 글 만들기**에서 3/5/10개를 생성한다. 서버가 실제 게시물/snapshot을 다시 조회해 후킹/길이/구조/질문/CTA/주제/카테고리/지표를 전달한다. NULL을 0으로 바꾸거나 사실·수치를 꾸며내지 않도록 지시한다. 기존 OpenAI 엔진/중복 검사/이력을 재사용한다.

생성 parameters에 `operationKind`, 원본 draft/snapshot ID, 분석 근거를 보존한다. 고유 링크의 AI Composer에서 편집 → 자동 시간 배분 → 검토 후 전체 Queue 저장으로 이어진다. 이 경로에서 AI 편집 버전이 일반 입력의 undefined 값으로 덮어써지던 문제를 수정했다.

Planner의 **최근 성과 반영** ON/OFF는 서버 계산 패턴과 최근 주제를 계획 생성에 전달한다. 표본 부족을 성공 패턴으로 만들지 않고 기존 콘텐츠 믹스/검토 후 배치를 유지한다.

## CSV Import

대량 화면에서 파일 업로드/붙여넣기 → 행별 preview → 정상 행 선택 → 저장한다. UTF-8/BOM, 따옴표/쉼표/줄바꿈을 지원하며 64KB/30행으로 제한한다. `content` 필수, `category`, `scheduled_at`, `account`, `template` 선택이다.

본문 500자, 활성 workspace 분류/계정/템플릿, 미래 예약, 기존/파일 내 중복을 검증한다. 예약은 timezone을 포함한 ISO 또는 KST 날짜·시간이다. 서버에서 다시 파싱/검증하고 선택 정상 행만 기존 원자적 RPC로 저장한다. 임시저장/예약만 가능하며 import 자체가 즉시 외부 게시하지 않는다. 잘못된 행을 자동 수정하거나 중복 경고를 무시하지 않는다.

## 실제 적용 migration

- `20261002002858_threads_live_accounts.sql`: 계정 metadata, private 암호화 credential/state, owner operation.
- `20261002002906_threads_live_pipeline.sql`: TEST/LIVE 단계, 잠금 재사용, 제한 재시도/Needs Attention.
- `20261002003700_threads_insights_snapshots.sql`: nullable post/account snapshot, private checkpoint job/lease.
- `20261002004753_threads_performance_feedback.sql`: Planner 성과 반영 옵션.
- `20261002010824_threads_csv_import.sql`: template provenance와 CSV 원자적 저장 wrapper.

새 DB/transport 검사와 실제 OpenAI → 편집 → Queue 브라우저 흐름은 통과했다. 브라우저의 표본 성과는 격리 DB이며 실제 Meta Insights 검증이 아니다. [검증 기록](TEST_NOTES.md)을 따른다. Meta 연결 후 초기 TEST 확인, 명시적 LIVE 전환과 실제 게시/수집 확인이 남는다.

공식 protocol 근거: [Meta Threads API sample/collection](https://github.com/fbsamples/threads_api), [Meta 공식 Postman 문서](https://www.postman.com/meta/threads/documentation/dht3nzz/threads-api). Threads 전용 authorize/code/long-lived/refresh/debug_token과 현재 공식 sample의 `graph.threads.com`을 사용한다. 버전은 앱 기본값을 따르며 Facebook OAuth/permissions 예제를 적용하지 않았다.
