import { chat, MODELS } from '../../config/groq';
import { ParsedQuery } from './parser';
import { AuthenticatedUser } from '../../middleware/auth';
import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const pool = new Pool({
  host: 'localhost',
  user: 'postgres',
  password: 'root',
  database: 'flowace',
  port: 5432,
});

/**
 * Preprocess team names to handle fuzzy/partial matching
 */
async function preprocessTeamNames(parsedQuery: ParsedQuery): Promise<ParsedQuery> {
  if (!parsedQuery.filters?.teams || parsedQuery.filters.teams.length === 0) {
    return parsedQuery;
  }

  try {
    // Get all available teams
    const teamResult = await pool.query('SELECT name FROM teams ORDER BY name');
    const availableTeams = teamResult.rows.map(row => row.name);

    // Process each team name in the filters
    const processedTeams: string[] = [];

    for (const teamName of parsedQuery.filters.teams) {
      // Try exact match first
      if (availableTeams.includes(teamName)) {
        processedTeams.push(teamName);
        continue;
      }

      // Try fuzzy matching
      const matches = findBestTeamMatches(teamName, availableTeams);
      if (matches.length > 0) {
        // Use the best match
        processedTeams.push(matches[0]);
      } else {
        // If no match found, keep the original (might be invalid, but let SQL handle it)
        console.warn(`No matching team found for: ${teamName}`);
        processedTeams.push(teamName);
      }
    }

    return {
      ...parsedQuery,
      filters: {
        ...parsedQuery.filters,
        teams: processedTeams
      }
    };
  } catch (error) {
    console.error('Error preprocessing team names:', error);
    // Return original query if preprocessing fails
    return parsedQuery;
  }
}

/**
 * Find best team name matches using fuzzy matching
 */
function findBestTeamMatches(inputTeam: string, availableTeams: string[]): string[] {
  const input = inputTeam.toLowerCase().trim();
  const matches: Array<{ team: string; score: number }> = [];

  for (const team of availableTeams) {
    const teamLower = team.toLowerCase();
    let score = 0;

    // Exact substring match gets highest score
    if (teamLower.includes(input)) {
      score += 100;
      // Bonus for starting with the input
      if (teamLower.startsWith(input)) {
        score += 50;
      }
      // Bonus for department match (e.g., "engineering" matches "Engineering Team 1")
      if (input.length >= 3 && teamLower.includes(input)) {
        score += 25;
      }
    }

    // Word-by-word matching
    const inputWords = input.split(/\s+/);
    const teamWords = teamLower.split(/\s+/);

    let wordMatches = 0;
    for (const inputWord of inputWords) {
      if (inputWord.length >= 3) { // Only match meaningful words
        for (const teamWord of teamWords) {
          if (teamWord.includes(inputWord) || inputWord.includes(teamWord)) {
            wordMatches++;
            break;
          }
        }
      }
    }

    if (wordMatches > 0) {
      score += wordMatches * 20;
    }

    // Levenshtein distance for close matches
    const distance = levenshteinDistance(input, teamLower);
    if (distance <= 2 && input.length > 3) {
      score += (3 - distance) * 10;
    }

    if (score > 0) {
      matches.push({ team, score });
    }
  }

  // Sort by score descending and return top matches
  return matches
    .sort((a, b) => b.score - a.score)
    .map(match => match.team)
    .slice(0, 3); // Return top 3 matches
}

/**
 * Calculate Levenshtein distance between two strings
 */
function levenshteinDistance(str1: string, str2: string): number {
  const matrix = Array(str2.length + 1).fill(null).map(() => Array(str1.length + 1).fill(null));

  for (let i = 0; i <= str1.length; i++) matrix[0][i] = i;
  for (let j = 0; j <= str2.length; j++) matrix[j][0] = j;

  for (let j = 1; j <= str2.length; j++) {
    for (let i = 1; i <= str1.length; i++) {
      const indicator = str1[i - 1] === str2[j - 1] ? 0 : 1;
      matrix[j][i] = Math.min(
        matrix[j][i - 1] + 1,     // deletion
        matrix[j - 1][i] + 1,     // insertion
        matrix[j - 1][i - 1] + indicator // substitution
      );
    }
  }

  return matrix[str2.length][str1.length];
}

const SCHEMA_CONTEXT = `
COMPLETE DATABASE SCHEMA WITH RELATIONSHIPS:

CORE ENTITIES:
==============

1. TEAMS TABLE:
   - id: UUID (Primary Key)
   - name: VARCHAR(255) - Team name (e.g., "Engineering Team 1")
   - department: VARCHAR(100) - Department (Engineering, Marketing, Sales, Finance, HR)
   - manager_id: UUID - References users(id) - Team manager
   - created_at: TIMESTAMP

2. USERS TABLE:
   - id: UUID (Primary Key)
   - email: VARCHAR(255) UNIQUE - User email
   - password_hash: VARCHAR(255) - Hashed password
   - name: VARCHAR(255) - Full name
   - role: VARCHAR(20) - 'admin', 'manager', 'employee'
   - team_id: UUID - References teams(id)
   - created_at: TIMESTAMP

USAGE TRACKING TABLES:
======================

3. DAILY_USAGE TABLE (Aggregated daily productivity metrics):
   - id: UUID (Primary Key)
   - user_id: UUID - References users(id)
   - date: DATE - Activity date
   - total_duration: INTEGER - Total working time in minutes
   - productive_duration: INTEGER - Productive time in minutes
   - unproductive_duration: INTEGER - Unproductive time in minutes
   - neutral_duration: INTEGER - Neutral activity time in minutes
   - project_duration: INTEGER - Time on projects in minutes
   - non_project_duration: INTEGER - Time not on projects in minutes
   - idle_duration: INTEGER - Idle time in minutes
   - created_at: TIMESTAMP

4. APP_USAGE TABLE (Detailed application usage):
   - id: UUID (Primary Key)
   - user_id: UUID - References users(id)
   - date: DATE - Usage date
   - app_name: VARCHAR(255) - Application name (e.g., "VS Code", "Chrome")
   - category: VARCHAR(100) - App category (Development, Communication, etc.)
   - duration: INTEGER - Duration in minutes
   - productivity_rating: VARCHAR(20) - 'productive', 'neutral', 'unproductive'
   - created_at: TIMESTAMP

PROJECT MANAGEMENT TABLES:
==========================

5. PROJECTS TABLE:
   - id: UUID (Primary Key)
   - name: VARCHAR(255) - Project name (e.g., "Website Redesign")
   - billable: BOOLEAN - Whether project is billable (true/false)
   - created_at: TIMESTAMP

6. PROJECT_TIME TABLE (Time tracking for specific projects):
   - id: UUID (Primary Key)
   - user_id: UUID - References users(id)
   - project_id: UUID - References projects(id)
   - date: DATE - Work date
   - duration: INTEGER - Duration in minutes spent on project
   - created_at: TIMESTAMP

CLASSIFICATION SYSTEM TABLES:
=============================

7. CLASSIFICATION_RULES TABLE (Approved app classifications):
   - id: UUID (Primary Key)
   - app_name: VARCHAR(255) - Application name
   - team_id: UUID - References teams(id), NULL for global rules
   - role: VARCHAR(20) - 'admin', 'manager', 'employee', NULL for global rules
   - classification: VARCHAR(20) - 'productive', 'neutral', 'unproductive'
   - confidence: DECIMAL(3,2) - 0.00 to 1.00 (confidence level)
   - reasoning: TEXT - Explanation of classification decision
   - approved_by: UUID - References users(id) - Who approved the rule
   - created_at: TIMESTAMP
   - UNIQUE(app_name, team_id, role) - Prevents duplicate rules

8. PENDING_CLASSIFICATIONS TABLE (Awaiting human review):
   - id: UUID (Primary Key)
   - app_name: VARCHAR(255) - Application being classified
   - team_id: UUID - References teams(id)
   - suggested_classification: VARCHAR(20) - AI suggestion
   - confidence: DECIMAL(3,2) - AI confidence level
   - reasoning: TEXT - AI reasoning for suggestion
   - status: VARCHAR(20) - 'pending', 'approved', 'rejected'
   - reviewed_by: UUID - References users(id), NULL if not reviewed
   - review_notes: TEXT - Human review notes
   - created_at: TIMESTAMP
   - reviewed_at: TIMESTAMP

AUDIT & ANALYTICS TABLES:
==========================

9. AGENT_AUDIT_LOG TABLE (Tracks AI agent actions):
   - id: UUID (Primary Key)
   - agent_type: VARCHAR(50) - 'chat', 'classification'
   - user_id: UUID - References users(id) - Who triggered the action
   - query: TEXT - User query or action description
   - response: TEXT - AI response or result
   - sql_generated: TEXT - Generated SQL query (for chat agent)
   - data_accessed: TEXT[] - Array of tables accessed
   - execution_time_ms: INTEGER - Response time
   - success: BOOLEAN - Whether the action succeeded
   - error_message: TEXT - Error details if failed
   - timestamp: TIMESTAMP

10. CLASSIFICATION_FEEDBACK TABLE (Learning from human corrections):
    - id: UUID (Primary Key)
    - rule_id: UUID - References classification_rules(id)
    - original_classification: VARCHAR(20) - What AI suggested
    - corrected_classification: VARCHAR(20) - What human chose
    - corrected_by: UUID - References users(id) - Who made the correction
    - reason: TEXT - Explanation for the correction
    - created_at: TIMESTAMP

CRITICAL BUSINESS RULES:
========================
🔥 ALL DURATIONS ARE STORED IN MINUTES (INTEGER TYPE)
- Convert to hours: divide by 60.0 (MUST use DECIMAL to avoid integer division bugs)
- Productivity rate: (productive_duration::DECIMAL / NULLIF(total_duration, 0)) * 100
- Use COALESCE for NULL handling to prevent division by zero
- ROUND results to 2 decimal places for readability

🔒 RBAC (Role-Based Access Control):
- ADMIN: Can see ALL data (WHERE 1=1)
- MANAGER: Can see their team + subordinates (team hierarchy)
- EMPLOYEE: Can only see their own data (user_id filter)

🎯 GLOBAL VS USER-SPECIFIC TABLES:
- GLOBAL TABLES (no RBAC filtering needed):
  - projects, teams, classification_rules (when global)
- USER-SPECIFIC TABLES (need RBAC filtering):
  - users, daily_usage, app_usage, project_time, agent_audit_log

📊 COMMON QUERY PATTERNS:
- User productivity: daily_usage with user filters
- Team analytics: JOIN users + teams + daily_usage
- App classification: app_usage with productivity_rating
- Project tracking: project_time JOIN projects
- Time ranges: Use date BETWEEN for filtering
- Aggregations: SUM, AVG, COUNT with proper grouping

⚡ PERFORMANCE CONSIDERATIONS:
- Use appropriate indexes (already created on common query patterns)
- Limit results for large datasets (default 100)
- Use EXPLAIN to optimize complex queries
- Consider partitioning for large historical data`;

const SYSTEM_PROMPT = `You are an expert SQL generator for a workforce analytics PostgreSQL database. Generate precise, efficient SELECT queries based on user intent and the comprehensive database schema provided.

DATABASE SCHEMA CONTEXT: ${SCHEMA_CONTEXT}

CORE GENERATION PRINCIPLES:

1. **INTENT ANALYSIS**:
   - "list" → Simple SELECT from single table (projects, teams, users, classification_rules)
   - "summary" → Aggregations (SUM, AVG, COUNT) across date ranges
   - "comparison" → GROUP BY dimensions with comparative metrics
   - "trend" → Time-series GROUP BY date with chronological ordering
   - "drill_down" → Detailed filtering and breakdowns

2. **TABLE SELECTION INTELLIGENCE**:
   - Productivity metrics → daily_usage table
   - App analysis → app_usage table
   - Project data → project_time JOIN projects
   - Team reports → users JOIN teams JOIN daily_usage
   - User lists → users table
   - Project lists → projects table
   - Classification rules → classification_rules table

3. **RBAC FILTERING**:
   - Global tables (projects, teams, classification_rules): {RBAC_FILTER} = "1=1"
   - User-data tables (daily_usage, app_usage, project_time): Apply user/team/role filters
   - Always start WHERE clause with {RBAC_FILTER}

4. **DATE RANGE HANDLING**:
   - Use parsed dateRange.start and dateRange.end from query
   - Format: date BETWEEN $1 AND $2
   - Convert relative dates using provided date context
   - For trends: GROUP BY date, ORDER BY date DESC

5. **METRIC CALCULATIONS**:
   - Duration in minutes → convert to hours: (SUM(duration) / 60.0)::numeric
   - Productivity rate: (productive_duration::numeric / NULLIF(total_duration, 0)) * 100
   - Round all decimals: ROUND(value::numeric, 2)
   - Handle NULLs: COALESCE(value, 0)

6. **QUERY PATTERNS**:

   **LIST QUERIES**:
   - Projects: SELECT name, billable FROM projects WHERE {RBAC_FILTER} ORDER BY name
   - Teams: SELECT name, department FROM teams WHERE {RBAC_FILTER} ORDER BY department, name
   - Users: SELECT name, email, role FROM users WHERE {RBAC_FILTER} ORDER BY role, name

   **TREND QUERIES**:
   - SELECT date, ROUND(SUM(total_duration)/60.0::numeric, 2) as total_hours,
           ROUND(AVG(productivity_rate)::numeric, 2) as avg_productivity
     FROM daily_usage
     WHERE {RBAC_FILTER} AND date BETWEEN $1 AND $2
     GROUP BY date ORDER BY date DESC

   **SUMMARY QUERIES**:
   - SELECT ROUND(SUM(total_duration)/60.0::numeric, 2) as total_hours,
           ROUND(SUM(productive_duration)/60.0::numeric, 2) as productive_hours
     FROM daily_usage
     WHERE {RBAC_FILTER} AND date BETWEEN $1 AND $2

   **COMPARISON QUERIES**:
   - Use GROUP BY on comparison dimension (team, user, project)
   - Calculate metrics for each group
   - ORDER BY metric DESC for rankings

7. **PARAMETERIZATION**:
   - Use $1, $2, etc. for all dynamic values
   - Date ranges: $1 = start_date, $2 = end_date
   - Filters: $3, $4, etc. for additional WHERE conditions

8. **PERFORMANCE**:
   - Use appropriate indexes (date, user_id, team_id)
   - LIMIT results (default 100, max 1000)
   - Prefer indexed columns in WHERE clauses

RESPONSE: Only return valid JSON with "sql", "params", and "description" fields.`;

export interface GeneratedSQL {
  sql: string;
  params: any[];
  description: string;
}



// Direct entity-based SQL generation for simple cases
function generateEntitySQL(parsedQuery: ParsedQuery, user: AuthenticatedUser): GeneratedSQL | null {
  // Force entity detection for known list queries
  if (parsedQuery.intent === 'list' && !parsedQuery.entity) {
    // Check the original query text if available
    // For now, assume if intent is list and no entity, it's a complex query
    return null;
  }

  if (!parsedQuery.entity) {
    return null;
  }

  const rbacFilter = getRBACFilter(user);

  switch (parsedQuery.entity) {
    case 'projects':
      return {
        sql: `SELECT name, billable FROM projects WHERE ${rbacFilter} ORDER BY name`,
        params: [],
        description: 'List all projects with their billable status'
      };

    case 'teams':
      return {
        sql: `SELECT name, department FROM teams WHERE ${rbacFilter} ORDER BY department, name`,
        params: [],
        description: 'List all teams grouped by department'
      };

    case 'users':
      return {
        sql: `SELECT name, email, role FROM users WHERE ${rbacFilter} ORDER BY role, name`,
        params: [],
        description: 'List users with their roles and email addresses'
      };

    case 'classification_rules':
      return {
        sql: `SELECT app_name, classification, confidence FROM classification_rules WHERE ${rbacFilter} ORDER BY app_name`,
        params: [],
        description: 'List all app classification rules'
      };

    default:
      return null;
  }
}



export async function generateSQL(
  parsedQuery: ParsedQuery,
  user: AuthenticatedUser
): Promise<GeneratedSQL> {
  console.log(`🤖 SQL Generation for: intent=${parsedQuery.intent}, entity=${parsedQuery.entity}, filters=${JSON.stringify(parsedQuery.filters)}`);

  // Try direct entity-based generation first for simple list queries
  const directSQL = generateEntitySQL(parsedQuery, user);
  if (directSQL) {
    console.log('✅ Using direct entity SQL generation:', directSQL.sql);
    return directSQL;
  }

  console.log('🤖 Using LLM for all other queries');
  // Pre-process team names for fuzzy matching
  const processedQuery = await preprocessTeamNames(parsedQuery);
  console.log('📤 Sending to LLM:', JSON.stringify(processedQuery, null, 2));

  const response = await chat(
    [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content: `Generate SQL for this parsed query using the database schema context:
${JSON.stringify(processedQuery, null, 2)}

User context:
- Role: ${user.role}
- Team ID: ${user.team_id}

INSTRUCTIONS:
- Use the comprehensive database schema to generate appropriate SQL
- {RBAC_FILTER} will be replaced with proper access controls
- For LIST queries: Use simple SELECT from the appropriate table
- For TREND queries: GROUP BY date and ORDER BY date DESC
- For SUMMARY queries: Use appropriate aggregations (SUM, AVG, etc.)
- For COMPARISON queries: GROUP BY comparison dimension
- Handle date ranges using BETWEEN with parameterized queries
- Convert durations from minutes to hours using /60.0
- Use proper PostgreSQL ROUND syntax: ROUND(value::numeric, 2)

The schema provides all table structures, relationships, and business rules needed to generate correct SQL.`,
      },
    ],
    { model: MODELS.SMART, temperature: 0 }
  );

  try {
    // Extract JSON from response
    let jsonStr = response;
    const jsonMatch = response.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      jsonStr = jsonMatch[1];
    }

    const generated = JSON.parse(jsonStr.trim());

    // Apply RBAC filter
    let sql = generated.sql;
    const rbacFilter = getRBACFilter(user, sql);

    // Handle various placements of {RBAC_FILTER}
    if (sql.includes('{RBAC_FILTER}')) {
      sql = sql.replace('{RBAC_FILTER}', rbacFilter);
    } else {
      // If LLM didn't include the placeholder, try to add it
      const whereMatch = sql.match(/WHERE\s+/i);
      if (whereMatch) {
        sql = sql.replace(/WHERE\s+/i, `WHERE ${rbacFilter} AND `);
      } else {
        // No WHERE clause, add one before GROUP BY, ORDER BY, or LIMIT
        const insertPoints = [/GROUP BY/i, /ORDER BY/i, /LIMIT/i];
        let inserted = false;
        for (const point of insertPoints) {
          if (point.test(sql)) {
            sql = sql.replace(point, `WHERE ${rbacFilter} $&`);
            inserted = true;
            break;
          }
        }
        if (!inserted) {
          // Add at the end before any final clause
          sql = sql.trimEnd() + ` WHERE ${rbacFilter}`;
        }
      }
    }

    // Clean up any double AND or syntax issues
    sql = sql.replace(/AND\s+AND/gi, 'AND');
    sql = sql.replace(/WHERE\s+AND/gi, 'WHERE');

    // Fix integer division issues - ensure numeric division for ratios (works with ROUND)
    // Match patterns like SUM(x) / NULLIF(SUM(y), 0) and add ::numeric cast
    sql = sql.replace(
      /SUM\((\w+)\)\s*\/\s*NULLIF\(SUM\((\w+)\),\s*0\)/gi,
      'SUM($1)::numeric / NULLIF(SUM($2), 0)'
    );
    // Also fix COALESCE patterns with division
    sql = sql.replace(
      /COALESCE\(SUM\((\w+)\)\s*\/\s*NULLIF\(SUM\((\w+)\),\s*0\),\s*0\)/gi,
      'COALESCE(SUM($1)::numeric / NULLIF(SUM($2), 0), 0)'
    );
    // Fix any ::float to ::numeric for ROUND compatibility
    sql = sql.replace(/::float\s*\//gi, '::numeric /');

    // Fix ROUND function parentheses - LLM often generates malformed ROUND syntax
    sql = sql.replace(
      /ROUND\(\s*\(([^)]+)\)\s*,\s*(\d+)\)/gi,
      'ROUND(($1), $2)'
    );
    // Fix cases where LLM forgets the second parenthesis in ROUND
    sql = sql.replace(
      /ROUND\(\s*\(([^)]+)\s*,\s*(\d+)\)/gi,
      'ROUND(($1), $2)'
    );

    // Ensure params include date range if SQL uses $1, $2 for dates
    let params = generated.params || [];

    // If SQL has date placeholders but params are empty, inject from parsedQuery
    if (sql.includes('$1') && sql.includes('$2') && params.length === 0) {
      if (processedQuery.filters?.dateRange) {
        params = [processedQuery.filters.dateRange.start, processedQuery.filters.dateRange.end];
      }
    }

    return {
      sql,
      params,
      description: generated.description || 'Query generated',
    };
  } catch (error) {
    console.error('Failed to parse SQL response:', response);
    throw new Error('Failed to generate SQL query');
  }
}

function getRBACFilter(user: AuthenticatedUser, sql?: string): string {
  // Check if this is a query on global tables that don't need RBAC filtering
  const globalTables = ['projects', 'teams', 'classification_rules', 'pending_classifications'];
  const isGlobalQuery = sql && globalTables.some(table =>
    sql.toLowerCase().includes(`from ${table}`) ||
    sql.toLowerCase().includes(`from ${table} `) ||
    sql.toLowerCase().includes(`from ${table},`) ||
    sql.toLowerCase().includes(`from ${table})`)
  );

  if (isGlobalQuery) {
    return '1=1'; // No RBAC filtering for global tables
  }

  switch (user.role) {
    case 'admin':
      return '1=1'; // No filter for admins

    case 'manager':
      return `user_id IN (SELECT id FROM users WHERE team_id = '${user.team_id}')`;

    case 'employee':
      return `user_id = '${user.id}'`;

    default:
      return '1=0'; // Deny all for unknown roles
  }
}

/**
 * Generate a simple fallback query when LLM fails
 */
export function generateFallbackSQL(
  parsedQuery: ParsedQuery,
  user: AuthenticatedUser
): GeneratedSQL {
  // For fallback, we'll generate a simple daily usage query
  // The RBAC filter will be applied appropriately
  const rbacFilter = getRBACFilter(user);
  const { filters } = parsedQuery;

  let dateFilter = '';
  const params: any[] = [];

  if (filters.dateRange?.start && filters.dateRange?.end) {
    dateFilter = `AND date BETWEEN $1 AND $2`;
    params.push(filters.dateRange.start, filters.dateRange.end);
  }

  const sql = `
    SELECT
      date,
      ROUND((SUM(total_duration) / 60.0)::numeric, 2) as total_hours,
      ROUND((SUM(productive_duration) / 60.0)::numeric, 2) as productive_hours,
      ROUND((AVG(productive_duration::float / NULLIF(total_duration, 0)) * 100)::numeric, 2) as avg_productivity_rate
    FROM daily_usage
    WHERE ${rbacFilter} ${dateFilter}
    GROUP BY date
    ORDER BY date DESC
    LIMIT 30
  `;

  return {
    sql: sql.trim(),
    params,
    description: 'Daily productivity summary',
  };
}
