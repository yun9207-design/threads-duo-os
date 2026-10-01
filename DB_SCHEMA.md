# DB SCHEMA

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
