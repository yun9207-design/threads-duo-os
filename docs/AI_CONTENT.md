# Threads AI 콘텐츠 엔진 — P1

Composer에서 **AI 작성** 또는 **대량 생성**을 선택한다. 주제 하나만 필수이며 핵심 사실·독자·목적·말투·템플릿을 더하면 방향을 구체화할 수 있다.

1. 한 개 글, 여러 버전(최대 30개), Day별 시리즈(최대 30개) 중 선택해 생성한다.
2. 카드에서 본문을 편집하고 수정 저장하거나 AI 다듬기·재생성을 사용한다. 새 AI 응답도 별도 기록으로 보관한다.
3. 선택 글의 시작/종료 날짜, 하루 게시 수, 시간대를 지정하고 자동 시간 배분을 누른다. 시간은 한국 시간 KST다.
4. 개별 시간을 필요에 따라 바꾸고 전체 예약을 누른다. 선택 글을 모두 검증한 뒤 한 트랜잭션으로 기존 drafts와 Queue에 연결한다.
5. AI 생성 기록의 결과 열기로 이어서 작업한다. `/composer?tab=ai&generation=<uuid>`는 기존 사용자/workspace 권한 안에서만 열린다.

게시 계정은 기존 Composer에서 선택한다. Meta 토큰 없이도 AI 생성·임시저장·예약은 가능하다. 실제 즉시/자동 Threads 게시는 기존 계정 연결과 게시 엔진의 조건을 그대로 따른다.

## 생성과 기록

- OpenAI Responses API + strict JSON Schema. 기본 모델은 `gpt-5.4-mini`, `OPENAI_MODEL`로 서버에서 변경할 수 있다.
- 첫 문장 후킹, 짧은 문장·줄바꿈, 불필요한 제목 제외, 광고 과장·없는 경험·근거 없는 수치 방지 규칙을 적용한다.
- 본문 500자, 요청 개수, 다른 관점/후킹, 복제 유사도를 서버에서 검사한다. 자동 유료 재시도는 하지 않는다.
- AI 요청 UUID를 먼저 예약한다. 같은 요청의 재전송으로 유료 호출을 중복 실행하지 않는다. workspace당 동시 생성 1개, 시간당 120개/24시간 300개 글로 제한한다.
- 원래 생성 결과와 편집 가능한 결과를 분리한다. 삭제는 목록에서 제외하는 방식이며 원래 생성 기록을 보존한다.
- `draft_id`로 실제 게시 여부를 연결한다. AI 글을 다시 저장하면 연결된 같은 draft를 수정하며, 버전 충돌·중복 내용은 기존 저장 규칙으로 처리한다.

## 서버 설정

`.env.example`에는 `OPENAI_API_KEY`, `OPENAI_MODEL` 이름만 있고 실제 키는 `.env.local`에 둔다. API 키는 브라우저 props·응답·번들·Git에 포함하지 않는다.

현재 Production은 프로젝트의 **Supabase Vault**에 암호화한 키를 보관한다. 서버는 기존 `THREADS_WORKSPACE_ID`·`THREADS_PUBLISHING_SECRET`과 요청 사용자의 workspace 멤버십으로 보호된 RPC를 통해서만 읽는다. Vault 직접 접근과 익명 RPC는 허용하지 않는다. 서버 환경변수 `OPENAI_API_KEY`를 설정하면 그것을 우선 사용한다. 키 값은 SQL migration이나 이 문서에 기록하지 않는다.

## DB 및 검증

`20261001213222_ai_content_engine.sql`, `20261001222528_ai_server_vault.sql`을 실제 Supabase에 적용했다. `ai_generation_jobs`, `ai_generated_posts`, `content_templates`와 예약/완료/Queue 연결 RPC를 추가했으며 기존 인증·workspace 정책과 게시 엔진은 수정하지 않는다.

`node scripts/test-ai-content.mjs`는 P1의 검증·생성 계약·편집·KST 분배·원자적 Queue 연결·템플릿·서버 키 경계를 검사한다. 격리 PostgreSQL/esbuild 검사용 의존성은 `.tools`에 있고 Production 의존성에는 추가하지 않는다. 실제 OpenAI 결과 10개는 실제 Supabase에 보존했다. UI의 실제 AI 생성→편집→10개 예약→Queue 새로고침과 실제 DB 연결 검사를 구분해 `TEST_NOTES.md`에 기록한다.
