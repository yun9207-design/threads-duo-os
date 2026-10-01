"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export function SessionControls({ email }: { email: string }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function logout() {
    if (pending) return;
    setPending(true);
    setError("");
    try {
      const supabase = createClient();
      if (!supabase) {
        setError("로그인 설정을 확인해 주세요.");
        setPending(false);
        return;
      }
      const { error: authError } = await supabase.auth.signOut({ scope: "local" });
      if (authError) {
        setError("로그아웃하지 못했습니다. 다시 시도해 주세요.");
        setPending(false);
        return;
      }
      // Reload after SDK cookie removal, discarding the authenticated page cache.
      window.location.replace("/login");
    } catch {
      setError("로그아웃에 연결하지 못했습니다. 다시 시도해 주세요.");
      setPending(false);
    }
  }

  return (
    <div className="session-bar" aria-label="로그인 사용자">
      <div className="session-user"><span className="status-dot" /><span>로그인됨</span><strong title={email}>{email}</strong></div>
      <div className="session-actions">
        {error && <span className="auth-error" role="alert">{error}</span>}
        <button className="logout-button" type="button" onClick={logout} disabled={pending}>{pending ? "로그아웃 중…" : "로그아웃"}</button>
      </div>
    </div>
  );
}
