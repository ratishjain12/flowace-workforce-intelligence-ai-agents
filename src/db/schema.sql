-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Teams table
CREATE TABLE IF NOT EXISTS teams (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    department VARCHAR(100) NOT NULL,
    manager_id UUID,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Users table
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    name VARCHAR(255) NOT NULL,
    role VARCHAR(20) NOT NULL CHECK (role IN ('admin', 'manager', 'employee')),
    team_id UUID REFERENCES teams(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Add foreign key for manager_id after users table exists
ALTER TABLE teams
    DROP CONSTRAINT IF EXISTS teams_manager_id_fkey;
ALTER TABLE teams
    ADD CONSTRAINT teams_manager_id_fkey
    FOREIGN KEY (manager_id) REFERENCES users(id);

-- Daily aggregate usage
CREATE TABLE IF NOT EXISTS daily_usage (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id),
    date DATE NOT NULL,
    total_duration INTEGER NOT NULL DEFAULT 0,
    productive_duration INTEGER NOT NULL DEFAULT 0,
    unproductive_duration INTEGER NOT NULL DEFAULT 0,
    neutral_duration INTEGER NOT NULL DEFAULT 0,
    project_duration INTEGER NOT NULL DEFAULT 0,
    non_project_duration INTEGER NOT NULL DEFAULT 0,
    idle_duration INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, date)
);

-- Application/Website usage
CREATE TABLE IF NOT EXISTS app_usage (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id),
    date DATE NOT NULL,
    app_name VARCHAR(255) NOT NULL,
    category VARCHAR(100),
    duration INTEGER NOT NULL DEFAULT 0,
    productivity_rating VARCHAR(20) NOT NULL CHECK (productivity_rating IN ('productive', 'neutral', 'unproductive')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Projects
CREATE TABLE IF NOT EXISTS projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    billable BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Project time tracking
CREATE TABLE IF NOT EXISTS project_time (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id),
    project_id UUID NOT NULL REFERENCES projects(id),
    date DATE NOT NULL,
    duration INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Classification rules (approved classifications)
CREATE TABLE IF NOT EXISTS classification_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    app_name VARCHAR(255) NOT NULL,
    team_id UUID REFERENCES teams(id),
    role VARCHAR(20) CHECK (role IN ('admin', 'manager', 'employee')),
    classification VARCHAR(20) NOT NULL CHECK (classification IN ('productive', 'neutral', 'unproductive')),
    confidence DECIMAL(3,2) NOT NULL DEFAULT 0.5,
    reasoning TEXT,
    approved_by UUID REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(app_name, team_id, role)
);

-- Pending classifications for human review
CREATE TABLE IF NOT EXISTS pending_classifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    app_name VARCHAR(255) NOT NULL,
    team_id UUID REFERENCES teams(id),
    suggested_classification VARCHAR(20) NOT NULL CHECK (suggested_classification IN ('productive', 'neutral', 'unproductive')),
    confidence DECIMAL(3,2) NOT NULL,
    reasoning TEXT NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    reviewed_by UUID REFERENCES users(id),
    review_notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    reviewed_at TIMESTAMP
);

-- Agent audit log
CREATE TABLE IF NOT EXISTS agent_audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_type VARCHAR(50) NOT NULL,
    user_id UUID REFERENCES users(id),
    query TEXT NOT NULL,
    response TEXT,
    sql_generated TEXT,
    data_accessed TEXT[],
    execution_time_ms INTEGER,
    success BOOLEAN DEFAULT true,
    error_message TEXT,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Classification feedback for learning
CREATE TABLE IF NOT EXISTS classification_feedback (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rule_id UUID REFERENCES classification_rules(id),
    original_classification VARCHAR(20) NOT NULL,
    corrected_classification VARCHAR(20) NOT NULL,
    corrected_by UUID REFERENCES users(id),
    reason TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for common queries
CREATE INDEX IF NOT EXISTS idx_daily_usage_user_date ON daily_usage(user_id, date);
CREATE INDEX IF NOT EXISTS idx_daily_usage_date ON daily_usage(date);
CREATE INDEX IF NOT EXISTS idx_app_usage_user_date ON app_usage(user_id, date);
CREATE INDEX IF NOT EXISTS idx_app_usage_app_name ON app_usage(app_name);
CREATE INDEX IF NOT EXISTS idx_project_time_user_date ON project_time(user_id, date);
CREATE INDEX IF NOT EXISTS idx_project_time_project ON project_time(project_id);
CREATE INDEX IF NOT EXISTS idx_users_team ON users(team_id);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_pending_classifications_status ON pending_classifications(status);
CREATE INDEX IF NOT EXISTS idx_agent_audit_log_timestamp ON agent_audit_log(timestamp);

-- Vector column for app name embeddings (for similarity search)
ALTER TABLE classification_rules
    ADD COLUMN IF NOT EXISTS app_name_embedding vector(384);

CREATE INDEX IF NOT EXISTS idx_classification_rules_embedding
    ON classification_rules
    USING ivfflat (app_name_embedding vector_cosine_ops)
    WITH (lists = 100);
