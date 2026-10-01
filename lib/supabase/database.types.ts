// Types for the workspace, drafts and approval history migrations.
export type DraftStatus = "draft" | "pending" | "approved";
export type PublicationStatus = "unpublished" | "publishing" | "published" | "failed";
export type ThreadsAccountRow = {
  id: string; workspace_id: string; threads_user_id: string; username: string;
  connected_by: string; connected_at: string;
};
export type DraftRow = {
  id: string; workspace_id: string; author_profile_id: string;
  topic: string; body: string; status: DraftStatus;
  created_at: string; updated_at: string; deleted_at: string | null; scheduled_at: string | null;
  publication_status: PublicationStatus; threads_account_id: string | null;
  threads_container_id: string | null; threads_post_id: string | null; published_at: string | null;
  publish_error: string | null; publish_attempt_id: string | null;
  publish_started_at: string | null; publish_retryable: boolean;
};
export type DraftApprovalHistoryRow = {
  id: string; draft_id: string; workspace_id: string; actor_user_id: string;
  from_status: DraftStatus; to_status: DraftStatus; note: string | null; created_at: string;
};
type ProfileRow = { id: string; display_name: string | null; created_at: string };
type WorkspaceRow = { id: string; name: string; created_by: string; created_at: string };
type MemberRow = {
  workspace_id: string;
  profile_id: string;
  role: "owner" | "member";
  joined_at: string;
};

export type Database = {
  public: {
    Tables: {
      threads_accounts: {
        Row: ThreadsAccountRow; Insert: never; Update: never; Relationships: [];
      };
      draft_approval_history: {
        Row: DraftApprovalHistoryRow;
        Insert: never;
        Update: never;
        Relationships: [{
          foreignKeyName: "draft_approval_history_draft_id_fkey";
          columns: ["draft_id"]; isOneToOne: false;
          referencedRelation: "drafts"; referencedColumns: ["id"];
        }, {
          foreignKeyName: "draft_approval_history_workspace_id_fkey";
          columns: ["workspace_id"]; isOneToOne: false;
          referencedRelation: "workspaces"; referencedColumns: ["id"];
        }, {
          foreignKeyName: "draft_approval_history_actor_user_id_fkey";
          columns: ["actor_user_id"]; isOneToOne: false;
          referencedRelation: "profiles"; referencedColumns: ["id"];
        }];
      };
      drafts: {
        Row: DraftRow;
        Insert: {
          workspace_id: string; author_profile_id: string; topic: string; body?: string; status?: DraftStatus;
        };
        Update: { topic?: string; body?: string; status?: DraftStatus; deleted_at?: string | null; scheduled_at?: string | null };
        Relationships: [{
          foreignKeyName: "drafts_workspace_id_fkey";
          columns: ["workspace_id"]; isOneToOne: false;
          referencedRelation: "workspaces"; referencedColumns: ["id"];
        }, {
          foreignKeyName: "drafts_author_profile_id_fkey";
          columns: ["author_profile_id"]; isOneToOne: false;
          referencedRelation: "profiles"; referencedColumns: ["id"];
        }];
      };
      profiles: {
        Row: ProfileRow;
        Insert: { id: string; display_name?: string | null; created_at?: string };
        Update: Partial<ProfileRow>;
        Relationships: [];
      };
      workspaces: {
        Row: WorkspaceRow;
        Insert: { id?: string; name: string; created_by: string; created_at?: string };
        Update: Partial<WorkspaceRow>;
        Relationships: [{
          foreignKeyName: "workspaces_created_by_fkey";
          columns: ["created_by"];
          isOneToOne: false;
          referencedRelation: "profiles";
          referencedColumns: ["id"];
        }];
      };
      workspace_members: {
        Row: MemberRow;
        Insert: {
          workspace_id: string;
          profile_id: string;
          role?: "owner" | "member";
          joined_at?: string;
        };
        Update: Partial<MemberRow>;
        Relationships: [{
          foreignKeyName: "workspace_members_profile_id_fkey";
          columns: ["profile_id"];
          isOneToOne: false;
          referencedRelation: "profiles";
          referencedColumns: ["id"];
        }, {
          foreignKeyName: "workspace_members_workspace_id_fkey";
          columns: ["workspace_id"];
          isOneToOne: false;
          referencedRelation: "workspaces";
          referencedColumns: ["id"];
        }];
      };
    };
    Views: Record<string, never>;
    Functions: {
      threads_publish_operation: {
        Args: { p_workspace_id: string; p_secret: string; p_operation: string;
          p_draft_id?: string; p_expected_updated_at?: string; p_attempt_id?: string;
          p_data?: Record<string, string | boolean> };
        Returns: unknown;
      };
      update_draft_with_history: {
        Args: { p_workspace_id: string; p_draft_id: string; p_expected_updated_at: string;
          p_topic: string; p_body: string; p_status: DraftStatus; p_note?: string | null };
        Returns: DraftRow[];
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
