import { query } from '../../config/database';
import { analyzeAppUsage, getUnclassifiedApps } from './analyzer';
import { classifyApp, ClassificationResult } from './classifier';
import { getAdjustedConfidenceThresholds, recordFeedback, getFeedbackStats } from './feedback';
import { logAgentAction } from '../../services/auditLogger';
import { AuthenticatedUser } from '../../middleware/auth';
import { ProductivityRating, PendingClassification } from '../../types';

export interface ClassificationSuggestion {
  id: string;
  appName: string;
  suggestedClassification: ProductivityRating;
  confidence: number;
  reasoning: string;
  factors: string[];
  requiresApproval: boolean;
  createdAt: Date;
}

/**
 * Main entry point: Classify a new application
 */
export async function classifyNewApp(
  appName: string,
  user: AuthenticatedUser
): Promise<ClassificationSuggestion> {
  const startTime = Date.now();

  try {
    // Check if app already has a rule
    const existingRule = await query(
      `SELECT * FROM classification_rules WHERE LOWER(app_name) = LOWER($1) LIMIT 1`,
      [appName]
    );

    if (existingRule.rows.length > 0) {
      const rule = existingRule.rows[0];
      return {
        id: rule.id,
        appName: rule.app_name,
        suggestedClassification: rule.classification,
        confidence: parseFloat(rule.confidence),
        reasoning: rule.reasoning || 'Existing classification rule',
        factors: ['existing_rule'],
        requiresApproval: false,
        createdAt: rule.created_at,
      };
    }

    // Analyze app usage patterns
    const analysis = await analyzeAppUsage(appName);

    // Get classification from LLM
    const result = await classifyApp(analysis);

    // Get dynamic thresholds
    const thresholds = await getAdjustedConfidenceThresholds();

    // Determine if auto-approve or queue for review
    const requiresApproval = result.confidence < thresholds.autoApprove;

    if (requiresApproval) {
      // Create pending classification for review
      const pending = await query(
        `INSERT INTO pending_classifications
         (app_name, team_id, suggested_classification, confidence, reasoning, status)
         VALUES ($1, $2, $3, $4, $5, 'pending')
         RETURNING *`,
        [
          appName,
          user.team_id,
          result.classification,
          result.confidence,
          result.reasoning,
        ]
      );

      await logAgentAction({
        agentType: 'classification',
        userId: user.id,
        queryText: `Classify app: ${appName}`,
        response: `Suggested: ${result.classification} (confidence: ${result.confidence})`,
        executionTimeMs: Date.now() - startTime,
        success: true,
      });

      return {
        id: pending.rows[0].id,
        appName,
        suggestedClassification: result.classification,
        confidence: result.confidence,
        reasoning: result.reasoning,
        factors: result.factors,
        requiresApproval: true,
        createdAt: pending.rows[0].created_at,
      };
    } else {
      // Auto-approve with high confidence
      const rule = await query(
        `INSERT INTO classification_rules
         (app_name, classification, confidence, reasoning)
         VALUES ($1, $2, $3, $4)
         RETURNING *`,
        [appName, result.classification, result.confidence, result.reasoning]
      );

      await logAgentAction({
        agentType: 'classification',
        userId: user.id,
        queryText: `Classify app: ${appName}`,
        response: `Auto-approved: ${result.classification} (confidence: ${result.confidence})`,
        executionTimeMs: Date.now() - startTime,
        success: true,
      });

      return {
        id: rule.rows[0].id,
        appName,
        suggestedClassification: result.classification,
        confidence: result.confidence,
        reasoning: result.reasoning,
        factors: result.factors,
        requiresApproval: false,
        createdAt: rule.rows[0].created_at,
      };
    }
  } catch (error) {
    await logAgentAction({
      agentType: 'classification',
      userId: user.id,
      queryText: `Classify app: ${appName}`,
      executionTimeMs: Date.now() - startTime,
      success: false,
      errorMessage: (error as Error).message,
    });

    throw error;
  }
}

/**
 * Get pending classifications for review
 */
export async function getPendingClassifications(
  user: AuthenticatedUser,
  options: { limit?: number; offset?: number } = {}
): Promise<PendingClassification[]> {
  const { limit = 50, offset = 0 } = options;

  // Apply RBAC - managers can only see their team's pending classifications
  let teamFilter = '';
  const params: any[] = [limit, offset];

  if (user.role === 'manager') {
    teamFilter = 'AND team_id = $3';
    params.push(user.team_id);
  } else if (user.role === 'employee') {
    // Employees can't review classifications
    return [];
  }

  const result = await query(
    `SELECT * FROM pending_classifications
     WHERE status = 'pending' ${teamFilter}
     ORDER BY created_at DESC
     LIMIT $1 OFFSET $2`,
    params
  );

  return result.rows;
}

/**
 * Approve a pending classification
 */
export async function approveClassification(
  pendingId: string,
  user: AuthenticatedUser,
  options: {
    overrideClassification?: ProductivityRating;
    notes?: string;
  } = {}
): Promise<void> {
  // Get the pending classification
  const pending = await query(
    `SELECT * FROM pending_classifications WHERE id = $1`,
    [pendingId]
  );

  if (pending.rows.length === 0) {
    throw new Error('Pending classification not found');
  }

  const record = pending.rows[0];
  const finalClassification =
    options.overrideClassification || record.suggested_classification;

  // Create the rule
  await query(
    `INSERT INTO classification_rules
     (app_name, team_id, classification, confidence, reasoning, approved_by)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (app_name, team_id, role) DO UPDATE
     SET classification = $3, confidence = $4, reasoning = $5, approved_by = $6`,
    [
      record.app_name,
      record.team_id,
      finalClassification,
      options.overrideClassification ? 1.0 : record.confidence,
      options.overrideClassification
        ? `Overridden by ${user.name}: ${options.notes || 'No notes'}`
        : record.reasoning,
      user.id,
    ]
  );

  // Update pending status
  await query(
    `UPDATE pending_classifications
     SET status = 'approved', reviewed_by = $1, reviewed_at = NOW(), review_notes = $2
     WHERE id = $3`,
    [user.id, options.notes || null, pendingId]
  );

  // If classification was overridden, record feedback
  if (options.overrideClassification && options.overrideClassification !== record.suggested_classification) {
    // Get the rule ID we just created/updated
    const rule = await query(
      `SELECT id FROM classification_rules WHERE app_name = $1 AND (team_id = $2 OR team_id IS NULL) LIMIT 1`,
      [record.app_name, record.team_id]
    );

    if (rule.rows.length > 0) {
      await recordFeedback(
        rule.rows[0].id,
        record.suggested_classification,
        options.overrideClassification,
        user.id,
        options.notes
      );
    }
  }

  await logAgentAction({
    agentType: 'classification',
    userId: user.id,
    queryText: `Approve classification: ${record.app_name}`,
    response: `Approved as: ${finalClassification}`,
    success: true,
  });
}

/**
 * Reject a pending classification
 */
export async function rejectClassification(
  pendingId: string,
  user: AuthenticatedUser,
  reason: string
): Promise<void> {
  const result = await query(
    `UPDATE pending_classifications
     SET status = 'rejected', reviewed_by = $1, reviewed_at = NOW(), review_notes = $2
     WHERE id = $3
     RETURNING app_name`,
    [user.id, reason, pendingId]
  );

  if (result.rowCount === 0) {
    throw new Error('Pending classification not found');
  }

  await logAgentAction({
    agentType: 'classification',
    userId: user.id,
    queryText: `Reject classification: ${result.rows[0].app_name}`,
    response: `Rejected: ${reason}`,
    success: true,
  });
}

/**
 * Get all classification rules
 */
export async function getClassificationRules(
  options: {
    teamId?: string;
    classification?: ProductivityRating;
    limit?: number;
    offset?: number;
  } = {}
): Promise<any[]> {
  const conditions: string[] = [];
  const params: any[] = [];
  let paramIndex = 1;

  if (options.teamId) {
    conditions.push(`(team_id = $${paramIndex++} OR team_id IS NULL)`);
    params.push(options.teamId);
  }

  if (options.classification) {
    conditions.push(`classification = $${paramIndex++}`);
    params.push(options.classification);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const result = await query(
    `SELECT * FROM classification_rules
     ${whereClause}
     ORDER BY app_name
     LIMIT $${paramIndex++} OFFSET $${paramIndex++}`,
    [...params, options.limit || 100, options.offset || 0]
  );

  return result.rows;
}

/**
 * Batch classify unclassified apps
 */
export async function classifyUnclassifiedApps(
  user: AuthenticatedUser,
  limit: number = 10
): Promise<ClassificationSuggestion[]> {
  const unclassified = await getUnclassifiedApps();
  const results: ClassificationSuggestion[] = [];

  for (const appName of unclassified.slice(0, limit)) {
    try {
      const suggestion = await classifyNewApp(appName, user);
      results.push(suggestion);
    } catch (error) {
      console.error(`Failed to classify ${appName}:`, error);
    }
  }

  return results;
}

export { getFeedbackStats, getUnclassifiedApps };
