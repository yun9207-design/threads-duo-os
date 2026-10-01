// Types for the workspace migration only. Regenerate when its schema changes.
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
