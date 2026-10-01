// Types for migrations 001/002. Drafts require migration 002 before use.
export type DraftStatus = "draft" | "pending" | "approved";
export type DraftRow = {
  id: string; workspace_id: string; author_profile_id: string;
  topic: string; body: string; status: DraftStatus;
  created_at: string; updated_at: string; deleted_at: string | null;
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
      drafts: {
        Row: DraftRow;
        Insert: {
          workspace_id: string; author_profile_id: string; topic: string; body?: string; status?: DraftStatus;
        };
        Update: { topic?: string; body?: string; status?: DraftStatus; deleted_at?: string | null };
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
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
