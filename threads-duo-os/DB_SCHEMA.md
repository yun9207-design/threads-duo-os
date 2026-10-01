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
