import { query } from '../../config/database';

export interface AppAnalysis {
  appName: string;
  totalUsageMinutes: number;
  uniqueUsers: number;
  avgDurationPerSession: number;
  peakUsageHour: number;
  teamDistribution: Record<string, number>;
  roleDistribution: Record<string, number>;
  existingSimilarApps: Array<{
    name: string;
    classification: string;
    similarity: number;
  }>;
}

/**
 * Analyze usage patterns for a given application
 */
export async function analyzeAppUsage(appName: string): Promise<AppAnalysis> {
  // Get basic usage stats
  const statsResult = await query(
    `SELECT
      COUNT(*) as total_sessions,
      SUM(duration) as total_minutes,
      COUNT(DISTINCT user_id) as unique_users,
      AVG(duration) as avg_duration
     FROM app_usage
     WHERE LOWER(app_name) = LOWER($1)`,
    [appName]
  );

  const stats = statsResult.rows[0];

  // Get team distribution
  const teamResult = await query(
    `SELECT t.name as team_name, COUNT(*) as usage_count
     FROM app_usage au
     JOIN users u ON au.user_id = u.id
     JOIN teams t ON u.team_id = t.id
     WHERE LOWER(au.app_name) = LOWER($1)
     GROUP BY t.name
     ORDER BY usage_count DESC`,
    [appName]
  );

  const teamDistribution: Record<string, number> = {};
  for (const row of teamResult.rows) {
    teamDistribution[row.team_name] = parseInt(row.usage_count);
  }

  // Get role distribution
  const roleResult = await query(
    `SELECT u.role, COUNT(*) as usage_count
     FROM app_usage au
     JOIN users u ON au.user_id = u.id
     WHERE LOWER(au.app_name) = LOWER($1)
     GROUP BY u.role
     ORDER BY usage_count DESC`,
    [appName]
  );

  const roleDistribution: Record<string, number> = {};
  for (const row of roleResult.rows) {
    roleDistribution[row.role] = parseInt(row.usage_count);
  }

  // Find similar apps by name/category
  const similarResult = await query(
    `SELECT
      app_name as name,
      classification,
      0.5 as similarity
     FROM classification_rules
     WHERE LOWER(app_name) LIKE '%' || LOWER($1) || '%'
        OR LOWER($1) LIKE '%' || LOWER(app_name) || '%'
     LIMIT 5`,
    [appName.split(' ')[0]] // Use first word for similarity
  );

  return {
    appName,
    totalUsageMinutes: parseInt(stats.total_minutes) || 0,
    uniqueUsers: parseInt(stats.unique_users) || 0,
    avgDurationPerSession: parseFloat(stats.avg_duration) || 0,
    peakUsageHour: 10, // Simplified - would need hour extraction
    teamDistribution,
    roleDistribution,
    existingSimilarApps: similarResult.rows,
  };
}

/**
 * Get apps that don't have classification rules
 */
export async function getUnclassifiedApps(): Promise<string[]> {
  const result = await query(
    `SELECT DISTINCT au.app_name
     FROM app_usage au
     LEFT JOIN classification_rules cr ON LOWER(au.app_name) = LOWER(cr.app_name)
     WHERE cr.id IS NULL
     ORDER BY au.app_name`
  );

  return result.rows.map((r) => r.app_name);
}

/**
 * Get apps with low confidence classifications
 */
export async function getLowConfidenceApps(threshold: number = 0.7): Promise<Array<{
  appName: string;
  classification: string;
  confidence: number;
}>> {
  const result = await query(
    `SELECT app_name, classification, confidence
     FROM classification_rules
     WHERE confidence < $1
     ORDER BY confidence ASC`,
    [threshold]
  );

  return result.rows.map((r) => ({
    appName: r.app_name,
    classification: r.classification,
    confidence: parseFloat(r.confidence),
  }));
}
