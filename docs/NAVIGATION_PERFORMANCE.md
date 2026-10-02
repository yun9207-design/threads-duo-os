# 페이지 전환 성능 — 2026-10-02

범위: 페이지 전환만 수정. 디자인/CSS, 게시 엔진, DB 스키마와 데이터, MASTER_PLAN 원본은 유지한다.

## 수정 전 Production 측정

Chrome의 기존 로그인 세션에서 메뉴 클릭 시작부터 새 페이지 h1 확인까지 같은 자동화 방식으로 측정했다. 아래 시간에는 브라우저 자동화 통신 비용이 포함된다. Supabase 수치는 같은 UTC 구간의 edge_logs에서 실제 `/auth/v1/user`와 `/rest/v1/*`를 집계했다. 분 단위 Cron RPC와 구간 밖 백그라운드 폴링은 제외한다.

| 이동 | 시작 UTC | 완료 UTC | 시간 ms | Auth HTTP | DB HTTP |
|---|---|---|---:|---:|---:|
| Dashboard → Calendar | 02:07:55.023 | 02:07:58.074 | 3051 | 1 | 11 |
| Calendar → Queue | 02:09:46.345 | 02:09:48.299 | 1954 | 1 | 12 |
| Queue → History | 02:09:15.577 | 02:09:18.069 | 2492 | 1 | 11 |
| History → Composer | 02:09:38.810 | 02:09:41.569 | 2759 | 1 | 12 |
| Composer → Planner | 02:09:41.569 | 02:09:44.519 | 2950 | 1 | 14 |

- 내부 일반 이동은 이미 next/link였다. MASTER_PLAN 새 탭, 로그인/로그아웃의 세션 초기화, 외부 Meta OAuth 이동만 일반 브라우저 이동을 사용했다. `router.refresh()`는 없었다.
- 공통 ProductApp 전체가 page마다 생성되어 sidebar와 polling이 다시 마운트됐다. 공유 layout/loading 경계가 없었다.
- 모든 화면이 drafts/accounts/categories/plans/templates/recurrences/worker를 기다렸고 인증 → workspace 목록 → workspace 상세 → 멤버십 → 데이터의 직렬 구간이 있었다.
- 여러 로더의 getUser 함수 호출은 Next의 동일 GET memoization으로 실제 네트워크에서 1회로 합쳐졌다. 함수 중복과 실제 Auth HTTP 중복을 혼동하지 않는다. workspace 목록/상세, 전체 멤버/자신의 멤버십은 별도 쿼리였다.
- 가장 느린 측정 요청: content_templates 733ms. DB 내부 upstream 처리 1~7ms에 비해 네트워크 왕복이 컸다.
- Supabase는 ap-northeast-1(도쿄), Vercel 응답은 `icn1::iad1`로 미국 동부 함수 실행을 확인했다. DB 지역 이동 없이 함수만 hnd1로 지정했다. [Vercel 지역 설정 공식 문서](https://vercel.com/docs/functions/configuring-functions/region).

## 변경

- 기존 route page를 `(product)` 공유 layout 아래로 이동. URL과 각 화면 내용은 유지한다.
- sidebar/session UI는 layout에 유지. Link prefetch와 loading shell 추가.
- 사용자별 mounted provider의 메모리 캐시. 브라우저 저장소/공유 서버 캐시를 사용하지 않는다. 로그인/로그아웃은 기존 전체 세션 초기화를 유지한다.
- 초기 1개 snapshot API, 라이브 데이터 30초, 운영 데이터 120초, 성과 60초 TTL. 동일 scope의 진행 중 요청도 합친다. 페이지 전환은 기존 snapshot을 즉시 표시하고 필요한 갱신만 백그라운드에서 수행한다.
- snapshot API는 매 요청 getUser 1회 및 workspace/membership 확인을 수행한다. 독립 workspace/member 쿼리를 병렬로 읽고 verified client를 하위 읽기에 전달한다. RLS와 기존 쓰기 API의 보안 검증은 유지한다. 초기 accounts 쿼리를 두 로더가 공유한다.
- 변경 결과는 provider에 즉시 반영. 변경 전 시작한 읽기가 새 결과를 덮지 않게 revision 검사와 scope 무효화를 적용한다.
- AI 기록/템플릿 읽기도 세션별 TTL/in-flight 캐시. 기록 변경 후 강제 갱신한다.
- Calendar는 날짜와 예약을 한 번 인덱싱하고 memoize. 불필요한 성과 패턴 계산은 Planner에서만 수행한다.
- `?__nav_perf=1`은 개발 진단용 console 측정만 활성화한다. 클릭 → commit 후 animation frame, document time origin, 브라우저 API 수를 기록하며 사용자 식별자·본문·키는 기록하지 않는다. 기본 화면에 진단 UI를 추가하지 않는다.

## 검증

- lint, typecheck, Production build 통과.
- `node scripts/test-navigation-performance.mjs`: 캐시 중복 요청/TTL/무효화/오류 복구와 Calendar 5,000개 항목의 월·주·상태·카테고리·반복 슬롯 표시 결과 보존 통과.
- Calendar 합계 인덱싱 82ms, 기존 방식의 비교/검사 포함 합계 2092ms. 합성 데이터의 CPU 검사이며 Production 사용자 전환 시간과 별도다.
- MASTER_PLAN 원본/public SHA256 모두 `3073aaab4c243c773675df4e123c8e3508e09caf1bf9529effe67022dfa34dff` 유지.
- Production 수정 후 실측은 배포 완료 후 아래에 기록한다.
