"use client";

import { useState, type FormEvent } from "react";
import { createClient } from "@/lib/supabase/client";

export function LoginForm({ configured }: { configured: boolean }) {
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setError("");

    const formData = new FormData(event.currentTarget);
    const email = String(formData.get("email") ?? "").trim();
    const password = String(formData.get("password") ?? "");
    if (!email || !password) {
      setError("이메일과 비밀번호를 모두 입력해 주세요.");
      return;
    }
    if (!configured) {
      setError("아직 로그인 연결이 설정되지 않았습니다. 관리자에게 확인해 주세요.");
      return;
    }

    setPending(true);
    try {
      const supabase = createClient();
      if (!supabase) {
        setError("로그인 설정을 확인할 수 없습니다. 관리자에게 확인해 주세요.");
        setPending(false);
        return;
      }
      const { error: authError } = await supabase.auth.signInWithPassword({ email, password });
      if (authError) {
        setError(authError.status === 429
          ? "로그인 시도가 많습니다. 잠시 후 다시 시도해 주세요."
          : "로그인하지 못했습니다. 이메일과 비밀번호를 확인해 주세요.");
        setPending(false);
        return;
      }
      // Cookies are written by the SDK before this full server navigation.
      window.location.replace("/");
    } catch {
      setError("로그인에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.");
      setPending(false);
    }
  }

  return (
    <form className="login-form" onSubmit={login} aria-busy={pending}>
      {!configured && <p className="auth-setup-note" role="status">로그인 연결을 준비 중이에요. 관리자에게 설정을 확인해 주세요.</p>}
      <label htmlFor="email">이메일</label>
      <input id="email" name="email" type="email" autoComplete="username" placeholder="이메일 주소" maxLength={254} required disabled={pending} />
      <label htmlFor="password">비밀번호</label>
      <input id="password" name="password" type="password" autoComplete="current-password" placeholder="비밀번호" maxLength={4096} required disabled={pending} />
      <div className="auth-error" role="alert" aria-live="polite">{error}</div>
      <button className="button primary login-submit" type="submit" disabled={pending}>{pending ? "로그인 중…" : "로그인"}<span aria-hidden="true">→</span></button>
    </form>
  );
}
