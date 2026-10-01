import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/login-form";
import { getSupabaseConfig } from "@/lib/supabase/config";
import { getAuthenticatedUser } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "로그인 · Threads Duo OS" };
export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const user = await getAuthenticatedUser();
  if (user) redirect("/");

  return (
    <main className="login-page">
      <div className="login-container">
        <div className="brand login-brand">
          <span className="brand-mark" aria-hidden="true"><i /><i /></span>
          <span>threads duo<span className="brand-sub">OUR CONTENT, IN SYNC.</span></span>
        </div>
        <section className="login-card" aria-labelledby="login-title">
          <span className="section-kicker">WELCOME BACK</span>
          <h1 id="login-title">함께 시작하는 오늘<span className="heading-dot">.</span></h1>
          <p className="login-description">이메일과 비밀번호로 로그인하고<br />우리의 콘텐츠를 이어서 준비하세요.</p>
          <LoginForm configured={!!getSupabaseConfig()} />
          <p className="login-caption">관리자가 준비한 계정으로 로그인해 주세요.</p>
        </section>
        <a className="login-plan-link" href="/MASTER_PLAN.html">프로젝트 마스터플랜 보기 ↗</a>
      </div>
    </main>
  );
}
