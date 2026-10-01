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
