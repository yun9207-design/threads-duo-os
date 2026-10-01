import { TodayDashboard } from "@/components/today-dashboard";
import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");

  return <TodayDashboard userEmail={user.email ?? "로그인 사용자"} />;
}
