import { TodayDashboard } from "@/components/today-dashboard";
import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "@/lib/supabase/server";
import { currentDraftWorkspace, listDrafts, type DraftWorkspace } from "@/lib/drafts";
import type { DraftRow } from "@/lib/supabase/database.types";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");

  let workspace: DraftWorkspace | null = null;
  let drafts: DraftRow[] = [];
  let loadError = "";
  try {
    workspace = await currentDraftWorkspace();
    drafts = await listDrafts(workspace.workspace.id);
  } catch {
    loadError = "워크스페이스의 글을 불러오지 못했습니다. 잠시 후 새로고침해 주세요.";
  }
  return <TodayDashboard userEmail={user.email ?? "로그인 사용자"}
    workspace={workspace} initialDrafts={drafts} loadError={loadError} referenceTime={new Date().toISOString()} />;
}
