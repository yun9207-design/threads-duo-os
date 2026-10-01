# DB SCHEMA

## Threads AI P1 추가 구조

| 테이블 | 저장 내용 |
| --- | --- |
| `ai_generation_jobs` | 요청 UUID, workspace/작성자, 입력 hash, 주제·목적·말투·모드·개수·parameters·모델, 생성 상태·원본 결과·오류·생성/완료 시각 |
| `ai_generated_posts` | 생성 작업/workspace, 순서·라벨·관점·500자 본문, 연결 draft, 수정 시각·목록 제외 시각 |
| `content_templates` | workspace/작성자, 이름·작성 규칙·목적·말투, 생성/수정/목록 제외 시각 |

세 테이블은 기존 `private.current_workspace_ids()`로 workspace 멤버 조회를 제한한다. 생성 작업은 해당 요청 작성자만 생성/완료하고, 같은 workspace 멤버는 결과/템플릿을 편집할 수 있다. anon 권한은 회수하고 ID·작성자·workspace 등 변경할 수 없는 컬럼에 클라이언트 UPDATE를 허용하지 않는다.

`reserve_ai_generation`은 요청 중복/동시 생성/시간당·일일 개수를 제한한다. `finish_ai_generation`은 정확한 개수를 확인하고 결과와 완료 상태를 한 트랜잭션에 저장한다. `save_ai_posts`는 AI 결과 버전과 기존 draft 버전을 확인한 뒤 기존 `save_product_post`로 일괄 저장/예약한다. AI→draft와 AI→job은 workspace까지 포함한 외래키이며 재저장은 같은 draft를 사용한다.

Production AI 키는 기존 Supabase Vault의 암호화 secret에 보관한다. `private.ai_server_credential`은 확인된 사용자·현재 멤버십·서버 전용 capability를 모두 확인하고 같은 workspace의 키 하나만 반환한다. 공개 wrapper는 invoker이며 anon/PUBLIC 실행 권한을 회수했다. 웹앱은 키를 서버 안에서만 사용한다. 실제 키 값은 migration에 없다.

실제 적용 migration은 `20261001213222_ai_content_engine.sql`, `20261001222528_ai_server_vault.sql`이다. 기존 Auth/Workspace/게시 정책은 유지한다.

## Threads Pro P0 추가 구조

`pro_product_p0`와 `pro_queue_requeue` migration을 실제 DB에 적용했다. drafts에 `auto_publish boolean`, `selected_threads_account_id uuid`, `history_hidden_at timestamptz`를 추가하고 선택 계정/workspace 복합 FK 및 due 부분 인덱스를 둔다. threads_accounts에는 `last_checked_at`, `token_status`를 추가한다. `queue_worker_status`는 workspace별 최근 실행 상태를 저장하며 멤버 SELECT만 허용한다. 원자적 단일/일괄 저장 RPC는 SECURITY INVOKER로 기존 drafts RLS를 따른다. 게시 결과가 불확실한 글은 계속 잠그며 안전하게 재시도 가능한 실패의 명시적 수정/재예약만 대기로 전환한다.

예약 작업자는 기존 private 게시 연산을 재사용한다. 기존 workspace별 secret digest와 일치하는 서버 capability로 heartbeat/due claim/해당 시도 결과 저장만 허용한다. 일반 사용자에게 게시 결과 열 UPDATE를 허용하지 않는다. Cron/Vault 설치 migration을 승인 후 적용했으며 매분 Production 실행기 호출/DB heartbeat를 확인했다. 상세는 `docs/PRO_PRODUCT.md`에 있다. 아래 기존 스키마와 기획은 보존한다.

추가 적용 migration: `20261001110343_threads_text_publishing.sql`. `threads_accounts`는 workspace별 Threads 사용자 ID/username/연결자/시각 metadata만 저장한다. `drafts`에 publication_status, threads_account_id, threads_container_id, threads_post_id, published_at, publish_error, publish_attempt_id, publish_started_at, publish_retryable을 추가했다. review status의 기존 세 값은 유지한다. 비노출 `private.threads_publishing_config`에는 서버 secret의 SHA256 digest만 저장하며 access token은 DB에 저장하지 않는다. metadata는 멤버 SELECT만 허용하고 게시 결과 열은 일반 client 쓰기가 불가능하다. 상세는 `docs/THREADS_PUBLISHING.md`.

## Scheduling 1단계 추가 스키마

실제 적용 migration: `20261001102605_draft_scheduling.sql`. 기존 drafts에 nullable `scheduled_at timestamptz` 하나만 추가했다. 활성 approved 글만 예약하도록 CHECK/trigger를 사용하고 새 시간은 미래·유한한 값만 받는다. 승인 철회/soft delete는 예약을 해제한다. 기존 workspace 멤버 RLS를 유지하고 scheduled_at UPDATE 열 권한 및 활성 예약 부분 인덱스만 추가했다. 테이블·게시 작업자·추가 상태값은 만들지 않는다. 상세는 `docs/SCHEDULING.md`를 따른다.

## 현재 Approval History 추가 스키마

실제 적용 migration: `20261001095837_draft_approval_history.sql`. `draft_approval_history(id, draft_id, workspace_id, actor_user_id, from_status, to_status, note, created_at)`를 추가했다. draft/workspace/actor FK 및 조회 인덱스, 현재 workspace 멤버만 읽는 RLS를 사용한다. 앱의 직접 이력 쓰기는 허용하지 않으며 상태 변경 trigger가 원자적으로 기록한다. 메모를 전달하는 SECURITY INVOKER RPC와 private trigger의 권한 구조는 `docs/APPROVAL_HISTORY.md`에 있다. 기존 테이블 열·기존 RLS·Auth는 변경하지 않았다.

## 현재 Drafts 추가 스키마 (migration 002)

2026-10-01 실제 `threads-duo-os` Supabase 프로젝트에 적용 완료. 파일은 `202610010002_drafts_crud.sql`이며 MCP가 생성한 원격 migration 이력은 `20261001090952 / drafts_crud`다. 기존 migration 001은 이전 단계의 관리자 적용 상태를 유지한다. 이 파일을 원격에 다시 적용하지 않는다. 향후 CLI 도입 시 기존 수동 적용 baseline 및 원격 이력과 로컬 파일 버전을 먼저 정합화해야 한다.

기존 profiles/workspaces/workspace_members와 정책은 변경하지 않는다. 새 `drafts`는 `id` UUID PK, `workspace_id` workspaces FK, `author_profile_id` profiles FK, `topic`(1–200자), `body`(최대 5,000자), `status` draft/pending/approved, `created_at`/`updated_at` timestamptz, nullable `deleted_at`을 가진다. 작성자·workspace·ID·작성일은 불변이다. workspace/작성일 활성 행 인덱스와 작성자 인덱스를 추가했다.

멤버 SELECT/UPDATE와 본인 작성 INSERT만 허용하는 RLS·열 권한, DB 수정 시각 trigger를 사용한다. 삭제는 복구 가능한 soft delete이며 authenticated 물리 DELETE를 허용하지 않는다. Threads FK·media·AI·승인 이력·예약/게시 열은 추가하지 않는다. 적용 SQL과 현재 검증/연결 상태는 `docs/DRAFTS.md`에 있다. 아래 최초 기획 및 이전 단계 기록은 보존한다.

workspaces(id, name, created_at)
profiles(id, user_id, workspace_id, display_name, role)
threads_accounts(id, workspace_id, owner_profile_id, threads_user_id, username, token_status, created_at)
style_profiles(id, workspace_id, owner_profile_id, name, json_rules, updated_at)
drafts(id, workspace_id, author_profile_id, threads_account_id, topic, body, content_type, status, scheduled_at, created_at, updated_at)
assets(id, workspace_id, draft_id, storage_path, public_url, media_type)
approvals(id, draft_id, reviewer_profile_id, action, note, created_at)
publish_jobs(id, draft_id, state, attempt_count, scheduled_at, published_at, thread_id, error_code, error_message)
metrics(id, threads_account_id, thread_id, measured_at, views, likes, replies, reposts, quotes, raw_json)
ai_generations(id, workspace_id, draft_id, model, prompt_version, input_hash, output_json, cost_estimate, created_at)
audit_logs(id, workspace_id, actor_profile_id, action, entity_type, entity_id, meta_json, created_at)

## 2026-10-01 — mock 단계 상태

위 스키마는 향후 Supabase 연결을 위한 설계로 유지한다. 이번 Next.js Today Dashboard 초기화에서는 DB, Supabase 클라이언트, migration, 테이블 생성, RLS 또는 Threads API 연결을 추가하지 않는다.

사용자·계정·예약 큐·승인 상태·성과 수치는 로컬 mock data이며 실제 테이블 레코드가 아니다. UI 상태는 브라우저 메모리에서만 변경되고 새로고침하면 초기값으로 돌아간다. 실제 persistence 및 권한 모델 구현 여부는 별도 P0 단계에서 확인한다.

## 2026-10-01 — Auth 1단계

Supabase Auth의 이메일/비밀번호와 세션만 추가하고 실제 URL·공개 키로 로컬 Auth 흐름을 검증했다. 로그인 실패와 익명 차단은 자동화로, 정상 세션 흐름은 사용자 수동 확인과 제공 화면으로 검증했다. 위 애플리케이션 테이블·migration·RLS·Storage는 추가하지 않았고 운영 데이터는 계속 mock이다. 로그인 사용자 표시는 Auth에서 서버 검증한 이메일을 사용하며 `profiles`나 `workspaces` 테이블을 읽지 않는다.

## 2026-10-01 — 실제 적용된 workspace 스키마

위 최초 기획 스키마는 보존한다. 이번 적용에서는 `profiles.workspace_id`/`profiles.role` 대신 별도 멤버십으로 다중 workspace와 workspace별 역할을 표현한다.

| 테이블 | 실제 열 |
| --- | --- |
| `profiles` | `id` UUID PK = Auth 사용자 ID/FK, `display_name` nullable text, `created_at` timestamptz |
| `workspaces` | `id` UUID PK, `name` text, `created_by` profiles FK, `created_at` timestamptz |
| `workspace_members` | `workspace_id` workspaces FK, `profile_id` profiles FK, `role` owner/member, `joined_at` timestamptz, 복합 PK(workspace_id, profile_id) |

멤버십 중복과 잘못된 역할은 제약으로 차단한다. 사용자별 workspace 조회 인덱스와 workspace별 owner 최대 한 명의 unique 인덱스를 둔다. 관리자 provisioning은 확인 완료 사용자 두 명을 같은 workspace에 owner/member로 연결한다. 최소 한 명의 owner 유지와 향후 소유권 이전은 관리자 책임이며 아직 앱으로 제공하지 않는다.

세 테이블의 RLS는 자기 프로필·같은 workspace 멤버 프로필과 가입된 workspace/멤버십 SELECT만 허용한다. authenticated SELECT 외 클라이언트 권한과 쓰기 정책은 없다. `private`의 읽기 helper 두 개는 멤버십 정책 재귀를 피하며 현재 `auth.uid()`로만 판단한다. Auth 사용자 자동 생성 trigger는 추가하지 않았다.

Migration: `supabase/migrations/202610010001_workspace_access.sql`. 관리자 생성 템플릿: `supabase/provision_workspace.sql`. 상세 정책·제약·검증은 `docs/WORKSPACE_ACCESS.md`, `docs/TEST_NOTES.md`에 있다. 실제 콘텐츠 관련 테이블과 Storage는 여전히 미구현이며 운영 데이터는 mock이다.
