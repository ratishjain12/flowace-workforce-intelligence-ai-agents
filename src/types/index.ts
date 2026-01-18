export type UserRole = 'admin' | 'manager' | 'employee';

export type ProductivityRating = 'productive' | 'neutral' | 'unproductive';

export type ClassificationStatus = 'pending' | 'approved' | 'rejected';

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  team_id: string;
  created_at: Date;
}

export interface Team {
  id: string;
  name: string;
  department: string;
  manager_id: string | null;
  created_at: Date;
}

export interface DailyUsage {
  id: string;
  user_id: string;
  date: Date;
  total_duration: number; // minutes
  productive_duration: number;
  unproductive_duration: number;
  neutral_duration: number;
  project_duration: number;
  non_project_duration: number;
  idle_duration: number;
}

export interface AppUsage {
  id: string;
  user_id: string;
  date: Date;
  app_name: string;
  category: string;
  duration: number; // minutes
  productivity_rating: ProductivityRating;
}

export interface Project {
  id: string;
  name: string;
  billable: boolean;
  created_at: Date;
}

export interface ProjectTime {
  id: string;
  user_id: string;
  project_id: string;
  date: Date;
  duration: number; // minutes
}

export interface ClassificationRule {
  id: string;
  app_name: string;
  team_id: string | null;
  role: UserRole | null;
  classification: ProductivityRating;
  confidence: number;
  approved_by: string | null;
  created_at: Date;
}

export interface PendingClassification {
  id: string;
  app_name: string;
  team_id: string | null;
  suggested_classification: ProductivityRating;
  confidence: number;
  reasoning: string;
  status: ClassificationStatus;
  reviewed_by: string | null;
  created_at: Date;
}

export interface AgentAuditLog {
  id: string;
  agent_type: 'chat' | 'classification';
  user_id: string;
  query: string;
  response: string;
  sql_generated: string | null;
  data_accessed: string[];
  timestamp: Date;
}

export interface ChatRequest {
  query: string;
  context?: {
    teamId?: string;
    dateRange?: {
      start: string;
      end: string;
    };
  };
}

export interface ChatResponse {
  answer: string;
  explanation: {
    sql: string;
    rowCount: number;
    dateRange: string;
    tablesAccessed: string[];
  };
  confidence: number;
  isGeneralQuery?: boolean;
}

export interface AuthenticatedRequest extends Express.Request {
  user?: {
    id: string;
    email: string;
    role: UserRole;
    team_id: string;
  };
}
