# Draft 승인 이력

2026-10-01 실제 Supabase 프로젝트에 `20261001095837_draft_approval_history.sql`을 적용했다. CLI로 생성한 파일을 MCP가 기록한 원격 migration 버전과 맞췄다. 이전 수동 workspace/Drafts baseline은 다시 적용하거나 수정하지 않았다.

## DB / 저장

`draft_approval_history`: `id`, `draft_id` → drafts, `workspace_id` → workspaces, `actor_user_id` → profiles(Auth UID), `from_status`, `to_status`, nullable `note`, `created_at`. 상태는 draft/pending/approved이며 이전·새 상태가 같을 수 없다. 메모는 최대 1,000자, 빈 메모는 null이다. `created_at`은 DB의 clock_timestamp이며 같은 transaction 안의 변경도 개별 시간이 기록된다.

Drafts의 AFTER UPDATE trigger가 실제 상태 변경마다 정확히 한 건을 기록한다. 최초 생성·본문만 수정·같은 상태 재저장·soft delete는 이력을 추가하지 않는다. 기존 데이터의 과거 이력은 추정하여 채우지 않는다. 상태 저장과 이력 INSERT는 원자적이어서 한쪽이 실패하면 함께 rollback된다.

PATCH는 SECURITY INVOKER RPC `update_draft_with_history`로 기존 RLS·열 권한·expectedUpdatedAt 조건을 유지한다. 선택적 approvalNote를 transaction-local 설정으로 trigger에 전달하고 이전 설정을 복원해 다음 변경에 메모가 남지 않는다. 상태가 같으면 메모만 저장할 수 없다. 직접 Data API에서 상태를 변경해도 trigger가 동작한다.

이력 append를 맡는 private trigger 함수만 제한된 SECURITY DEFINER 권한을 사용한다. search_path가 비어 있고 명시적 auth.uid와 실제 멤버십을 확인한다. 클라이언트가 직접 실행할 수 없으며 actor/workspace/from/to는 입력받지 않고 실제 변경 행·세션에서 결정한다. 관리자 SQL 상태 변경도 올바른 사용자 claims가 필요하다.

## 조회 / 화면

이력 테이블은 현재 workspace 멤버 SELECT만 허용하는 RLS를 적용했다. anon/PUBLIC 및 클라이언트 INSERT/UPDATE/DELETE 권한은 없다. 기존 Auth/Workspace/기존 RLS는 변경하지 않았다.

`GET /api/workspaces/[workspaceId]/drafts/[draftId]/history`는 활성 Draft 접근을 확인한 뒤 created_at/id 오름차순으로 조회한다. 응답은 private/no-store이다. soft delete 시 DB 이력은 보존되지만 삭제된 글 상세 API는 제공하지 않는다.

기존 글 편집 카드의 상태 선택 아래에서 상태 변경 메모를 입력하고 기존 변경 저장 버튼을 사용한다. 카드 하단의 승인 이력에 이전 → 새 상태, 변경자, KST 시간, 선택적 메모를 오래된 순서로 표시한다. 저장 후 이력을 다시 읽으며 글을 바꾸면 이전 요청을 취소한다.

## 검증

- `node scripts/test-approval-history.mjs`: 격리 PostgreSQL에서 draft → pending → approved의 정확히 2건·시간순·actor·메모를 확인했다. 같은 상태/본문 재저장 후에도 2건이다. 기존 Auth/RLS 검사 모음은 실행하지 않는다.
- 실제 기존 로그인 세션에서 동일한 두 번의 상태 변경과 메모 저장·이력 표시를 자동 확인했다. SQL 대조 결과도 정확히 2건이다. 테스트 글은 soft delete로 정리하고 이력은 보존했다.
- 상세 실행 결과는 [TEST_NOTES.md](TEST_NOTES.md), [화면 기록](screenshots/approval-history-live.jpg)을 참고한다.

승인 이력 외 게시·AI·예약·Threads 계정·새로운 Auth/Workspace 기능은 추가하지 않았다.
