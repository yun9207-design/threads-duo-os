<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Threads Pro 캐시와 Navigation 성능 유지

- 후속 기능 개발에서도 현재 persistent Layout, 공유 데이터 provider, Link prefetch, loading shell을 유지한다. 내부 이동은 client-side routing을 사용한다.
- 일반 CRUD 후 전체 페이지 reload, `router.refresh()`, 전체 캐시 삭제를 사용하지 않는다. 변경 응답으로 해당 리소스의 공유 상태를 먼저 업데이트하고, 필요한 리소스만 정확히 invalidate/revalidate한다.
- 예약 생성·수정·취소는 drafts/예약 데이터와 이를 사용하는 Queue, Calendar, Dashboard만 갱신한다. Accounts, Templates, Categories, 로그인 사용자, workspace 등 관계없는 데이터는 다시 요청하지 않는다.
- 템플릿 변경은 관련 템플릿 캐시만, 계정 연결 변경은 해당 계정 및 연결 상태 캐시만 갱신한다. 파생 화면은 변경된 공유 데이터에서 다시 계산하며 각 화면이 같은 요청을 중복 실행하지 않게 한다.
- 현재 `live`/`operations`처럼 여러 리소스를 묶은 캐시 범위를 수정할 때는 변경된 리소스의 키와 의존 관계를 구분한다. 편의를 위한 광범위한 무효화로 관련 없는 조회를 유발하지 않는다.
- 캐시의 세션 격리, 진행 중 요청 중복 방지, 기존 TTL 동작을 유지한다. 클라이언트 캐시 최적화를 이유로 서버 인증·workspace 권한 검증·RLS를 제거하지 않는다.
- 성능 기준과 측정 방법은 `docs/NAVIGATION_PERFORMANCE.md`를 따른다. 후속 변경은 해당 CRUD 흐름과 영향받는 navigation만 확인하며, 기존 Auth/A·B 로그인/RLS 검증을 반복하지 않는다. 워밍된 메뉴 전환에서 불필요한 Auth/DB 요청이 생기거나 화면 표시가 데이터를 기다리는 회귀를 방지한다.
