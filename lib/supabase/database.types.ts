// Types for the workspace, drafts and approval history migrations.
import type {Category,ContentPlan,RecurringSchedule} from "../content-operations";
export type DraftStatus = "draft" | "pending" | "approved";
export type PublicationStatus = "unpublished" | "publishing" | "published" | "failed";
export type ThreadsAccountRow = {
  id: string; workspace_id: string; threads_user_id: string; username: string;
  connected_by: string; connected_at: string;
  last_checked_at: string | null; token_status: "valid" | "invalid" | "unknown";
};
export type DraftRow = {
  id: string; workspace_id: string; author_profile_id: string; category_id:string|null;
  topic: string; body: string; status: DraftStatus;
  created_at: string; updated_at: string; deleted_at: string | null; scheduled_at: string | null;
  publication_status: PublicationStatus; threads_account_id: string | null;
  threads_container_id: string | null; threads_post_id: string | null; published_at: string | null;
  publish_error: string | null; publish_attempt_id: string | null;
  publish_started_at: string | null; publish_retryable: boolean;
  auto_publish: boolean; selected_threads_account_id: string | null; history_hidden_at: string | null;
};
export type DraftApprovalHistoryRow = {
  id: string; draft_id: string; workspace_id: string; actor_user_id: string;
  from_status: DraftStatus; to_status: DraftStatus; note: string | null; created_at: string;
};
export type Json = string | number | boolean | null | { [key:string]:Json|undefined } | Json[];
export type AiGenerationRow = {id:string;workspace_id:string;actor_user_id:string;request_hash:string;topic:string;purpose:string;tone:string;
  mode:"single"|"multiple"|"series";post_count:number;parameters:Json;model:string;status:"generating"|"completed"|"failed";
  results:Json|null;error:string|null;created_at:string;completed_at:string|null};
export type AiPostRow = {id:string;workspace_id:string;generation_id:string;position:number;label:string;angle:string;body:string;
  draft_id:string|null;deleted_at:string|null;created_at:string;updated_at:string};
export type ContentTemplateRow = {id:string;workspace_id:string;created_by:string;name:string;instruction:string;purpose:string;tone:string;
  created_at:string;updated_at:string;deleted_at:string|null};
type ProfileRow = { id: string; display_name: string | null; created_at: string };
type PlanItemJson=import("../content-operations").PlanItem;
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
      content_categories:{Row:Category;Insert:{workspace_id:string;created_by:string;name:string;color:string};Update:{name?:string;color?:string;archived_at?:string};Relationships:[]};
      content_plans:{Row:ContentPlan;Insert:{workspace_id:string;created_by:string;request_id:string;business:string;goal:string;audience:string;start_date:string;end_date:string;target_count:number;mix:Record<string,number>;items:PlanItemJson[];status?:string};Update:{items?:PlanItemJson[];status?:string};Relationships:[]};
      recurring_schedules:{Row:RecurringSchedule;Insert:Omit<RecurringSchedule,"id"|"updated_at">&{created_by:string};Update:Partial<Omit<RecurringSchedule,"id"|"workspace_id"|"updated_at">>;Relationships:[]};
      ai_generation_jobs:{Row:AiGenerationRow;Insert:never;Update:{status?:string;error?:string;completed_at?:string};Relationships:[]};
      ai_generated_posts:{Row:AiPostRow;Insert:never;Update:{body?:string;draft_id?:string;deleted_at?:string};Relationships:[]};
      content_templates:{Row:ContentTemplateRow;Insert:{workspace_id:string;created_by:string;name:string;instruction:string;purpose:string;tone:string};
        Update:{name?:string;instruction?:string;purpose?:string;tone?:string;deleted_at?:string};Relationships:[]};
      queue_worker_status: {
        Row: { workspace_id: string; last_run_at: string | null; status: string; detail: string | null };
        Insert: never; Update: never; Relationships: [];
      };
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
        Update: { topic?: string; body?: string; status?: DraftStatus; deleted_at?: string | null; scheduled_at?: string | null;
          auto_publish?: boolean; selected_threads_account_id?: string | null; history_hidden_at?: string | null };
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
      save_categorized_posts:{Args:{p_workspace_id:string;p_posts:Json;p_ai?:boolean};Returns:DraftRow[]};
      place_content_plan:{Args:{p_workspace_id:string;p_plan_id:string;p_expected_updated_at:string;p_posts:Json};Returns:DraftRow[]};
      ai_server_credential:{Args:{p_workspace_id:string;p_server_secret:string};Returns:string|null};
      reserve_ai_generation:{Args:{p_workspace_id:string;p_id:string;p_hash:string;p_parameters:Json;p_model:string};Returns:Json};
      finish_ai_generation:{Args:{p_workspace_id:string;p_id:string;p_posts:Json};Returns:AiPostRow[]};
      save_ai_posts:{Args:{p_workspace_id:string;p_posts:Json};Returns:DraftRow[]};
      save_product_post: {
        Args: { p_workspace_id: string; p_body: string; p_mode: string; p_draft_id?: string;
          p_expected_updated_at?: string; p_scheduled_at?: string | null; p_account_id?: string | null; p_allow_duplicate?: boolean };
        Returns: DraftRow[];
      };
      save_product_batch: { Args: { p_workspace_id: string; p_posts: Record<string,string|boolean|null>[] }; Returns: DraftRow[] };
      product_worker_operation: {
        Args: { p_workspace_id: string; p_secret: string; p_operation: string;
          p_draft_id?: string; p_attempt_id?: string; p_data?: Record<string,string|boolean> };
        Returns: unknown;
      };
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
