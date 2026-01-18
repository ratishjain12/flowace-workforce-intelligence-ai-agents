import { Router, Response } from 'express';
import { getAuditLogs } from '../services/auditLogger';
import { authMiddleware, AuthenticatedRequest, requireRole } from '../middleware/auth';

const router = Router();

// Apply auth middleware to all routes
router.use(authMiddleware as any);

/**
 * GET /api/audit
 * Get audit logs (admins only)
 */
router.get(
  '/',
  requireRole('admin') as any,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const agentType = req.query.agentType as string;
      const userId = req.query.userId as string;
      const startDate = req.query.startDate
        ? new Date(req.query.startDate as string)
        : undefined;
      const endDate = req.query.endDate
        ? new Date(req.query.endDate as string)
        : undefined;
      const limit = parseInt(req.query.limit as string) || 100;
      const offset = parseInt(req.query.offset as string) || 0;

      const logs = await getAuditLogs({
        agentType,
        userId,
        startDate,
        endDate,
        limit,
        offset,
      });

      res.json({
        total: logs.length,
        items: logs,
      });
    } catch (error) {
      console.error('Get audit logs error:', error);
      res.status(500).json({ error: 'Failed to fetch audit logs' });
    }
  }
);

/**
 * GET /api/audit/summary
 * Get audit summary statistics (admins only)
 */
router.get(
  '/summary',
  requireRole('admin') as any,
  async (_req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { query } = require('../config/database');

      // Get summary stats
      const stats = await query(`
        SELECT
          agent_type,
          COUNT(*) as total_requests,
          COUNT(CASE WHEN success = true THEN 1 END) as successful,
          COUNT(CASE WHEN success = false THEN 1 END) as failed,
          AVG(execution_time_ms) as avg_execution_time_ms,
          MAX(execution_time_ms) as max_execution_time_ms
        FROM agent_audit_log
        WHERE timestamp > NOW() - INTERVAL '7 days'
        GROUP BY agent_type
      `);

      // Get daily usage
      const dailyUsage = await query(`
        SELECT
          DATE(timestamp) as date,
          agent_type,
          COUNT(*) as requests
        FROM agent_audit_log
        WHERE timestamp > NOW() - INTERVAL '7 days'
        GROUP BY DATE(timestamp), agent_type
        ORDER BY date DESC
      `);

      res.json({
        summary: stats.rows,
        dailyUsage: dailyUsage.rows,
      });
    } catch (error) {
      console.error('Get audit summary error:', error);
      res.status(500).json({ error: 'Failed to fetch audit summary' });
    }
  }
);

export default router;
