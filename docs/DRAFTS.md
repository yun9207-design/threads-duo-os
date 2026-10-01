# Drafts DB CRUD

## 범위

Today Dashboard에서 새 글 작성, 목록/상태 필터, 수정, 삭제를 제공한다. Auth/Session/기존 workspace 코드·정책을 재설계하지 않는다. 현재 workspace는 로그인 사용자가 조회할 수 있는 이름 `Duo Workspace` 한 개로 선택하며 없거나 중복되면 접근을 열지 않는다.

글의 `draft / pending / approved`는 저장하는 상태값이다. 후속 [Approval History](APPROVAL_HISTORY.md) 단계에서 상태 변경 이력과 선택적 메모를 추가했다. 별도 reviewer 권한, Threads 계정, OAuth, AI, 예약/게시, Analytics, 결제 기능은 없다. `approved`를 저장해도 외부에 게시하지 않는다. owner/member 모두 공동 글을 수정할 수 있다.

## 스키마 / 권한

`supabase/migrations/202610010002_drafts_crud.sql`은 기존 migration 001이 적용된 DB에 **한 번만** 적용한다. 원자적 migration이며 기존 테이블이 있으면 덮어쓰지 않고 실패한다. migration 001과 provisioning을 실제 DB에서 다시 실행하지 않는다.

`drafts`: UUID `id`, `workspace_id` → workspaces FK, `author_profile_id` → profiles FK, `topic`(1–200자), `body`(최대 5,000자), `status`(draft/pending/approved), `created_at`, `updated_at`, nullable `deleted_at`.

- RLS SELECT/UPDATE: 현재 사용자 멤버십의 workspace만 허용한다. 기존 `private.current_workspace_ids()`를 재사용한다.
- INSERT: 멤버 workspace + 작성자가 `auth.uid()`인 경우만 허용한다. 서버는 작성자 ID를 세션에서 결정한다.
- 열 권한: INSERT는 workspace/작성자/주제/본문/상태, UPDATE는 주제/본문/상태/삭제 시각만 허용한다. ID/workspace/작성자/작성일은 변경할 수 없다. trigger도 신원 열 변경을 거절하고 수정 시각을 DB 시계로 갱신한다.
- anon과 PUBLIC 권한은 없다. authenticated의 물리 DELETE도 없다.
- 삭제는 `deleted_at`을 기록하는 soft delete다. 일반 목록/상세/API는 삭제 글을 제외한다. 같은 workspace의 권한 있는 멤버는 Data API에서 삭제된 행도 조회 가능하며 관리자가 복구할 수 있다. 앱 복구 UI는 이번 범위가 아니다.

문서 근거: [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [열 권한](https://supabase.com/docs/guides/database/postgres/column-level-security).

## API / 저장 흐름

| 경로 | 메서드 | 동작 |
| --- | --- | --- |
| `/api/workspaces/[workspaceId]/drafts` | GET / POST | 활성 글 목록 / 생성 |
| `/api/workspaces/[workspaceId]/drafts/[draftId]` | GET / PATCH / DELETE | 활성 글 조회 / 수정 / soft delete |

POST 입력: `{ topic, body, status }`. PATCH는 위 세 값과 `expectedUpdatedAt`, 선택적 `approvalNote`; DELETE는 `expectedUpdatedAt`만 받는다. PATCH는 현재 메모 전달 RPC를 사용한다. ID/작성자/workspace 등 알 수 없는 입력 필드는 거절한다. UPDATE/DELETE는 DB 수정 시각을 조건으로 사용해 오래된 편집은 409로 거절한다. 다른 사용자가 수정한 경우 목록을 새로 불러오고 해당 글을 다시 열어 수정한다.

각 API는 기존 서버용 세션 클라이언트를 통해 getUser와 실제 멤버십을 확인하고 JWT로 Data API를 호출한다. URL ID를 바꿔도 RLS와 workspace/id 조건이 유지된다. 익명 401, 접근 불가/없음 404, 입력 400, 다른 origin 403, 너무 큰 JSON 413, 충돌 409, DB 오류 503을 반환한다. 응답은 `private, no-store`이며 DB 내부 오류/토큰을 노출하지 않는다. mutation은 같은 Origin/Host의 JSON만 받는다.

Dashboard는 서버에서 최초 데이터를 읽고, 저장/삭제 성공 후 목록을 DB에서 다시 조회한다. 새로고침도 같은 조회를 수행하며 mock 데이터로 대체하지 않는다. 목록/상태별 건수/승인 대기 카드와 workspace 이름/역할은 실제 DB 값이다. 기존 mock 파일은 참고용으로 보존하지만 Dashboard에서 사용하지 않는다.

## 자동검사

```powershell
node scripts/test-drafts.mjs
node scripts/smoke-drafts-http.mjs http://127.0.0.1:3000
npm run lint
npm run typecheck
npm run build
```

격리 PostgreSQL 검사 의존성은 Git 제외 디렉터리에 설치한다: `npm install --prefix .tools/rls-tests --no-audit --no-fund @electric-sql/pglite`. 테스트는 실제 migration/정책을 실행하고 디스크 DB를 닫고 다시 열어 영속성을 확인한다. 기존 workspace RLS 50개나 A/B 로그인 검사를 재실행하지 않는다.

실제 DB의 새 정책 검사: 관리자용 `supabase/tests/drafts_smoke.sql`. 새 글만 transaction 안에서 만들며 마지막에 rollback한다. 인증 역할/claims를 설정하는 SQL 정책 검사이며 실제 비밀번호 로그인이나 브라우저 세션 검사가 아니다. 관리자 실행 권한은 앱 또는 브라우저 코드에 포함하지 않는다.

## 현재 적용 상태

2026-10-01 Supabase 도구 연결 후 실제 `threads-duo-os` 프로젝트(`qemmkooyjmqaduofoquf`)에 적용했다. 원격 migration 이력은 `20261001090952 / drafts_crud`이고 로컬 준비 파일은 위 migration 002다. 같은 파일을 다시 적용하지 않는다. 기존 workspace migration/provisioning/Auth 정책은 변경하지 않았다. CLI로 후속 migration을 관리하기 전 수동 baseline과 원격/로컬 migration 버전을 정합화해야 한다.

기존 A 로그인 세션에서 테스트 글 **한 개**를 작성하고 목록 표시·본문 수정·draft → pending → approved 저장·새로고침 유지·삭제를 확인했다. DB 행과 수정 내용/상태를 SQL로 대조했다. 삭제 후 `deleted_at`만 기록되고 원문이 유지되는 것을 확인한 뒤 관리자 SQL로 해당 행을 복구했다. 화면 목록에도 다시 나타났으며 테스트 종료 시 같은 글을 다시 soft delete했다. 복구 UI는 없다.

같은 세션의 외부 workspace Drafts API는 404를 반환했다. 실제 DB authenticated 역할에서도 새 Drafts의 외부 workspace SELECT는 숨겨지고 INSERT는 거절됐다. 새 로그인·A/B 반복·기존 RLS 50개 검사는 수행하지 않았다. 격리 PostgreSQL/HTTP 경계 검사와 최종 lint/typecheck/production build는 통과했다. [실제 저장·새로고침 화면](screenshots/drafts-live-approved.jpg), 상세 결과는 [TEST_NOTES.md](TEST_NOTES.md)를 참고한다. 이 검증 상태로 main push를 통해 Vercel Git 배포한다. 배포 Ready 여부는 해당 커밋의 GitHub Vercel 상태와 최종 실행 보고를 기준으로 확인한다.
