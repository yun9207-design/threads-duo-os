# Scheduling 1단계

승인된 글의 게시 예정 시간만 저장한다. 실제 Threads 게시 실행·작업자·Cron·publish_jobs·예약 상태값은 추가하지 않는다. 기존 Auth/Session/Workspace/Draft CRUD/승인 이력은 그대로 사용한다.

## DB

공식 Supabase CLI로 생성하고 실제 적용 버전에 맞춘 `20261001102605_draft_scheduling.sql`을 프로젝트 `qemmkooyjmqaduofoquf`에 적용했다.

- `drafts.scheduled_at timestamptz NULL` 하나만 추가한다. NULL은 예약 없음/취소다.
- `status='approved'`이며 `deleted_at IS NULL`인 글만 예약할 수 있다. CHECK와 SECURITY INVOKER trigger가 직접 Data API 요청에도 동일 조건을 강제한다.
- 새로운 시간은 유한한 미래 시각이어야 한다. 시간이 이미 지난 기존 예약은 보존한다. 본문 저장에 과거 예약이 장애가 되지 않으며 자동 게시되지 않는다.
- 승인 상태를 되돌리거나 soft delete하면 기존 예약을 해제한다. 글을 복구해도 취소된 예약은 자동 복원하지 않는다.
- `workspace_id, scheduled_at, id`의 활성 예약 부분 인덱스를 추가한다. 기존 멤버 RLS/identity 보호/updated_at trigger는 변경하지 않고 authenticated UPDATE 열 권한에 scheduled_at만 추가한다.

## API와 화면

`PATCH /api/workspaces/[workspaceId]/drafts/[draftId]/schedule`에 `{ scheduledAt: ISO시간 또는 null, expectedUpdatedAt: 마지막 저장 버전 }`을 보낸다. 기존 세션·workspace 확인·RLS·동시 변경 차단·same-origin JSON·private/no-store 응답을 재사용한다. 다른 필드, 잘못된/과거 날짜를 거절한다. 새 키나 환경변수는 없다.

승인된 기존 글을 열면 예약 날짜/시간 입력과 예약 저장·변경·취소 버튼이 표시된다. 글의 미저장 변경사항이 있으면 먼저 글을 저장해야 한다. 저장된 시간을 명시적으로 표시하고 서버 응답의 updated_at을 다음 변경 버전으로 사용한다.

예약 입력·표시는 브라우저 시간대와 무관하게 한국 시간(KST, Asia/Seoul)으로 해석한다. DB에는 UTC 기준 시각을 저장한다. 예: `2026-10-02 10:15 KST` → `2026-10-02T01:15:00Z`.

Dashboard는 기존 DB 목록의 활성 approved + scheduled_at 행만 집계한다. **오늘 예약**은 한국 시간 오늘 날짜 전체, **다가오는 예약**은 한국 시간 내일 이후다. 두 건수는 중복되지 않는다. 시간순 예약 목록에는 지난 지정 시간도 남아 있으며 게시 완료로 바꾸지 않는다. 서버 기준 시각으로 첫 화면을 렌더링하고 열린 화면의 날짜 기준을 30초마다 갱신한다. 새로고침/목록 새로고침은 DB에서 다시 읽는다.

## 검증

- `node scripts/test-scheduling.mjs`: 예약 저장/변경/취소, draft/pending/과거/infinity 차단, 디스크 DB close/reopen 유지, 승인 철회·삭제 시 취소, KST 날짜 경계와 실제 행 집계.
- `node scripts/smoke-scheduling-http.mjs [origin]`: 신규 예약 API의 입력/Origin/캐시 경계만 검사한다. 로그인 시도나 기존 권한 반복 검사는 없다.
- 실제 기존 A 세션에서 검증 글 작성 → 오늘 22:00 예약(오늘 1) → 내일 10:15 변경(다가오는 1) → 새로고침 유지 → 취소 → 새로고침 0 확인.
- 실제 authenticated A subject의 DB 요청에서 draft/pending 예약 거절을 확인했다. 해당 fixture transaction은 rollback했다. 실제 UI 검증 글은 예약 취소 후 soft delete해 정리했다.
- 상세 결과는 `TEST_NOTES.md`, 실제 화면은 `screenshots/scheduling-live.jpg`를 참고한다.

배포는 기존 GitHub main → Vercel Git 연동을 사용한다. 실제 배포 완료 상태와 Production 신규 API smoke는 해당 commit status 및 최종 작업 보고를 기준으로 한다.
