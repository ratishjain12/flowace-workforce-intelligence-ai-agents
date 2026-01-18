import { query } from '../config/database';

// Allowed tables for querying
const ALLOWED_TABLES = new Set([
  'users',
  'teams',
  'daily_usage',
  'app_usage',
  'projects',
  'project_time',
  'classification_rules',
]);

// Dangerous SQL keywords/patterns
const DANGEROUS_PATTERNS = [
  /\bDROP\b/i,
  /\bDELETE\b/i,
  /\bTRUNCATE\b/i,
  /\bINSERT\b/i,
  /\bUPDATE\b/i,
  /\bALTER\b/i,
  /\bCREATE\b/i,
  /\bGRANT\b/i,
  /\bREVOKE\b/i,
  /;\s*\w/i, // Multiple statements
  /--/,      // SQL comments (potential injection)
  /\/\*/,    // Block comments
];

export interface QueryResult {
  rows: any[];
  rowCount: number;
  tablesAccessed: string[];
  executionTimeMs: number;
}

export interface QueryValidationResult {
  valid: boolean;
  error?: string;
  tablesAccessed: string[];
}

/**
 * Validate SQL query for safety
 */
export function validateQuery(sql: string): QueryValidationResult {
  // Check for dangerous patterns
  for (const pattern of DANGEROUS_PATTERNS) {
    if (pattern.test(sql)) {
      return {
        valid: false,
        error: `Query contains forbidden pattern: ${pattern.source}`,
        tablesAccessed: [],
      };
    }
  }

  // Must be a SELECT query
  if (!sql.trim().toUpperCase().startsWith('SELECT')) {
    return {
      valid: false,
      error: 'Only SELECT queries are allowed',
      tablesAccessed: [],
    };
  }

  // Extract table names from query
  const tablePattern = /\bFROM\s+(\w+)|\bJOIN\s+(\w+)/gi;
  const tables: string[] = [];
  let match;

  while ((match = tablePattern.exec(sql)) !== null) {
    const tableName = (match[1] || match[2]).toLowerCase();
    if (!tables.includes(tableName)) {
      tables.push(tableName);
    }
  }

  // Check if all tables are allowed
  for (const table of tables) {
    if (!ALLOWED_TABLES.has(table)) {
      return {
        valid: false,
        error: `Access to table '${table}' is not allowed`,
        tablesAccessed: tables,
      };
    }
  }

  return {
    valid: true,
    tablesAccessed: tables,
  };
}

/**
 * Execute a validated SQL query
 */
export async function executeQuery(
  sql: string,
  params: any[] = []
): Promise<QueryResult> {
  const validation = validateQuery(sql);

  if (!validation.valid) {
    throw new Error(`Query validation failed: ${validation.error}`);
  }

  const startTime = Date.now();

  try {
    const result = await query(sql, params);
    const executionTimeMs = Date.now() - startTime;

    return {
      rows: result.rows,
      rowCount: result.rowCount || 0,
      tablesAccessed: validation.tablesAccessed,
      executionTimeMs,
    };
  } catch (error) {
    throw new Error(`Query execution failed: ${(error as Error).message}`);
  }
}

/**
 * Execute query with timeout protection
 */
export async function executeQueryWithTimeout(
  sql: string,
  params: any[] = [],
  timeoutMs: number = 30000
): Promise<QueryResult> {
  return Promise.race([
    executeQuery(sql, params),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Query timeout')), timeoutMs)
    ),
  ]);
}
