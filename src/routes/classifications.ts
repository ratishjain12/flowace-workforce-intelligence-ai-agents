import { Router, Response } from 'express';
import {
  classifyNewApp,
  getPendingClassifications,
  approveClassification,
  rejectClassification,
  getClassificationRules,
  classifyUnclassifiedApps,
  getFeedbackStats,
  getUnclassifiedApps,
} from '../agents/classification';
import { authMiddleware, AuthenticatedRequest, requireRole } from '../middleware/auth';

const router = Router();

// Apply auth middleware to all routes
router.use(authMiddleware as any);

/**
 * POST /api/classifications/classify
 * Classify a new application
 */
router.post('/classify', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { appName } = req.body;

    if (!appName || typeof appName !== 'string') {
      res.status(400).json({ error: 'appName is required' });
      return;
    }

    if (!req.user) {
      res.status(401).json({ error: 'User not authenticated' });
      return;
    }

    const result = await classifyNewApp(appName, req.user);
    res.json(result);
  } catch (error) {
    console.error('Classification error:', error);
    res.status(500).json({
      error: 'Failed to classify application',
      details: (error as Error).message,
    });
  }
});

/**
 * GET /api/classifications/pending
 * Get pending classifications for review (managers and admins only)
 */
router.get(
  '/pending',
  requireRole('admin', 'manager') as any,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const limit = parseInt(req.query.limit as string) || 50;
      const offset = parseInt(req.query.offset as string) || 0;

      if (!req.user) {
        res.status(401).json({ error: 'User not authenticated' });
        return;
      }

      const pending = await getPendingClassifications(req.user, { limit, offset });
      res.json({
        total: pending.length,
        items: pending,
      });
    } catch (error) {
      console.error('Get pending error:', error);
      res.status(500).json({ error: 'Failed to fetch pending classifications' });
    }
  }
);

/**
 * POST /api/classifications/:id/approve
 * Approve a pending classification (managers and admins only)
 */
router.post(
  '/:id/approve',
  requireRole('admin', 'manager') as any,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const body = req.body || {};
      const { overrideClassification, notes } = body;

      if (!req.user) {
        res.status(401).json({ error: 'User not authenticated' });
        return;
      }

      // Type-safe extraction of parameters
      let overrideRating: 'productive' | 'neutral' | 'unproductive' | undefined;
      if (typeof overrideClassification === 'string') {
        const validRatings = ['productive', 'neutral', 'unproductive'] as const;
        overrideRating = validRatings.includes(overrideClassification as any) ? overrideClassification as any : undefined;
      } else {
        overrideRating = undefined;
      }

      let notesStr: string | undefined;
      if (typeof notes === 'string') {
        notesStr = notes;
      } else if (Array.isArray(notes) && notes.length > 0) {
        notesStr = notes[0];
      } else {
        notesStr = undefined;
      }

      // @ts-ignore - TypeScript strict checking on Express body parser types
      await approveClassification(id, req.user, {
        overrideClassification: overrideRating,
        notes: notesStr,
      });

      res.json({ message: 'Classification approved successfully' });
    } catch (error) {
      console.error('Approve error:', error);
      res.status(500).json({
        error: 'Failed to approve classification',
        details: (error as Error).message,
      });
    }
  }
);

/**
 * POST /api/classifications/:id/reject
 * Reject a pending classification (managers and admins only)
 */
router.post(
  '/:id/reject',
  requireRole('admin', 'manager') as any,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const { reason } = req.body;

      if (!reason || (typeof reason === 'string' && reason.trim() === '')) {
        res.status(400).json({ error: 'Rejection reason is required' });
        return;
      }

      if (!req.user) {
        res.status(401).json({ error: 'User not authenticated' });
        return;
      }

      const reasonStr = Array.isArray(reason) ? reason[0] : reason;
      // @ts-ignore - TypeScript strict checking on Express body parser types
      await rejectClassification(id, req.user, reasonStr);
      res.json({ message: 'Classification rejected successfully' });
    } catch (error) {
      console.error('Reject error:', error);
      res.status(500).json({
        error: 'Failed to reject classification',
        details: (error as Error).message,
      });
    }
  }
);

/**
 * GET /api/classifications/rules
 * Get all classification rules
 */
router.get('/rules', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const teamId = req.query.teamId as string;
    const classification = req.query.classification as string;
    const limit = parseInt(req.query.limit as string) || 100;
    const offset = parseInt(req.query.offset as string) || 0;

    const rules = await getClassificationRules({
      teamId,
      classification: classification as any,
      limit,
      offset,
    });

    res.json({
      total: rules.length,
      items: rules,
    });
  } catch (error) {
    console.error('Get rules error:', error);
    res.status(500).json({ error: 'Failed to fetch classification rules' });
  }
});

/**
 * GET /api/classifications/unclassified
 * Get list of unclassified apps
 */
router.get('/unclassified', async (_req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const apps = await getUnclassifiedApps();
    res.json({
      total: apps.length,
      items: apps,
    });
  } catch (error) {
    console.error('Get unclassified error:', error);
    res.status(500).json({ error: 'Failed to fetch unclassified apps' });
  }
});

/**
 * POST /api/classifications/batch
 * Batch classify unclassified apps (admins only)
 */
router.post(
  '/batch',
  requireRole('admin') as any,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const limit = parseInt(req.body.limit) || 10;

      if (!req.user) {
        res.status(401).json({ error: 'User not authenticated' });
        return;
      }

      const results = await classifyUnclassifiedApps(req.user, limit);
      res.json({
        processed: results.length,
        items: results,
      });
    } catch (error) {
      console.error('Batch classify error:', error);
      res.status(500).json({ error: 'Failed to batch classify apps' });
    }
  }
);

/**
 * GET /api/classifications/stats
 * Get classification feedback statistics
 */
router.get('/stats', async (_req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const stats = await getFeedbackStats();
    res.json(stats);
  } catch (error) {
    console.error('Get stats error:', error);
    res.status(500).json({ error: 'Failed to fetch classification stats' });
  }
});

export default router;
