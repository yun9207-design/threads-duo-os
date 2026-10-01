# SECURITY

1. Meta App Secret와 Threads access token은 서버에서만 처리.
2. .env.local은 gitignore.
3. 브라우저 localStorage에 access token 장기 저장 금지.
4. Supabase RLS로 workspace 경계를 강제.
5. 게시 endpoint는 approved draft만 허용.
6. 예약 job은 idempotency key로 중복게시 방지.
7. 로그에 access token/app secret/AI key 기록 금지.
8. 초기 테스트는 서브 Threads 계정.
9. 자동게시 실패 시 제한된 재시도 + 사람 확인.
