import { query } from '../../config/database';
import { ProductivityRating } from '../../types';

export interface FeedbackStats {
  totalApprovals: number;
  totalRejections: number;
  totalOverrides: number;
  approvalRate: number;
  classificationAccuracy: Record<ProductivityRating, number>;
}

/**
 * Record feedback when a classification is overridden
 */
export async function recordFeedback(
  ruleId: string,
  originalClassification: ProductivityRating,
  correctedClassification: ProductivityRating,
  correctedBy: string,
  reason?: string
): Promise<void> {
  await query(
    `INSERT INTO classification_feedback
     (rule_id, original_classification, corrected_classification, corrected_by, reason)
     VALUES ($1, $2, $3, $4, $5)`,
    [ruleId, originalClassification, correctedClassification, correctedBy, reason]
  );

  // Update the rule with new classification
  await query(
    `UPDATE classification_rules
     SET classification = $1, confidence = confidence * 0.9
     WHERE id = $2`,
    [correctedClassification, ruleId]
  );
}

/**
 * Get feedback statistics for analytics
 */
export async function getFeedbackStats(): Promise<FeedbackStats> {
  // Get approval/rejection counts
  const statusResult = await query(
    `SELECT status, COUNT(*) as count
     FROM pending_classifications
     WHERE status != 'pending'
     GROUP BY status`
  );

  let totalApprovals = 0;
  let totalRejections = 0;

  for (const row of statusResult.rows) {
    if (row.status === 'approved') {
      totalApprovals = parseInt(row.count);
    } else if (row.status === 'rejected') {
      totalRejections = parseInt(row.count);
    }
  }

  // Get override count
  const overrideResult = await query(
    `SELECT COUNT(*) as count FROM classification_feedback`
  );
  const totalOverrides = parseInt(overrideResult.rows[0].count);

  // Get accuracy by classification type
  const accuracyResult = await query(
    `SELECT
      original_classification,
      COUNT(*) as total,
      SUM(CASE WHEN original_classification = corrected_classification THEN 1 ELSE 0 END) as correct
     FROM classification_feedback
     GROUP BY original_classification`
  );

  const classificationAccuracy: Record<ProductivityRating, number> = {
    productive: 1,
    neutral: 1,
    unproductive: 1,
  };

  for (const row of accuracyResult.rows) {
    const classification = row.original_classification as ProductivityRating;
    const accuracy = parseInt(row.correct) / parseInt(row.total);
    classificationAccuracy[classification] = accuracy;
  }

  const total = totalApprovals + totalRejections;
  const approvalRate = total > 0 ? totalApprovals / total : 0;

  return {
    totalApprovals,
    totalRejections,
    totalOverrides,
    approvalRate,
    classificationAccuracy,
  };
}

/**
 * Adjust confidence thresholds based on historical accuracy
 */
export async function getAdjustedConfidenceThresholds(): Promise<{
  autoApprove: number;
  requireReview: number;
}> {
  const stats = await getFeedbackStats();

  // Default thresholds
  let autoApprove = 0.9;
  let requireReview = 0.7;

  // If we have enough feedback, adjust based on accuracy
  if (stats.totalApprovals + stats.totalRejections >= 50) {
    // Lower auto-approve threshold if accuracy is high
    if (stats.approvalRate > 0.95) {
      autoApprove = 0.85;
    } else if (stats.approvalRate < 0.8) {
      // Raise threshold if accuracy is low
      autoApprove = 0.95;
    }
  }

  return { autoApprove, requireReview };
}

/**
 * Get apps that are frequently overridden (candidates for retraining)
 */
export async function getFrequentlyOverriddenApps(): Promise<Array<{
  appName: string;
  overrideCount: number;
  lastClassification: ProductivityRating;
  mostCommonCorrection: ProductivityRating;
}>> {
  const result = await query(
    `SELECT
      cr.app_name,
      COUNT(cf.id) as override_count,
      cr.classification as last_classification,
      MODE() WITHIN GROUP (ORDER BY cf.corrected_classification) as most_common_correction
     FROM classification_feedback cf
     JOIN classification_rules cr ON cf.rule_id = cr.id
     GROUP BY cr.app_name, cr.classification
     HAVING COUNT(cf.id) >= 3
     ORDER BY override_count DESC`
  );

  return result.rows.map((r) => ({
    appName: r.app_name,
    overrideCount: parseInt(r.override_count),
    lastClassification: r.last_classification,
    mostCommonCorrection: r.most_common_correction,
  }));
}
