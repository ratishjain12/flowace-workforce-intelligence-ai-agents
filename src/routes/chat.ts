import { Router, Response } from 'express';
import { handleChatQuery } from '../agents/chat';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth';

const router = Router();

// Apply auth middleware to all routes
router.use(authMiddleware as any);

/**
 * POST /api/chat
 * Send a natural language query to the chat agent
 */
router.post('/', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { query, context } = req.body;

    if (!query || typeof query !== 'string') {
      res.status(400).json({ error: 'Query is required and must be a string' });
      return;
    }

    if (query.length > 1000) {
      res.status(400).json({ error: 'Query must be less than 1000 characters' });
      return;
    }

    if (!req.user) {
      res.status(401).json({ error: 'User not authenticated' });
      return;
    }

    const response = await handleChatQuery(query, req.user, {
      timeout: 30000,
      conversationHistory: context?.conversationHistory || [],
    });

    res.json(response);
  } catch (error) {
    console.error('Chat error:', error);
    res.status(500).json({
      error: 'Failed to process query',
      details: (error as Error).message,
    });
  }
});

/**
 * GET /api/chat/examples
 * Get example queries for the chat agent
 */
router.get('/examples', (_req: AuthenticatedRequest, res: Response): void => {
  res.json({
    examples: [
      {
        category: 'Summary',
        queries: [
          'What was the average productivity rate last week?',
          'Show me total hours worked this month',
          'How much idle time was recorded yesterday?',
        ],
      },
      {
        category: 'Comparison',
        queries: [
          'Compare productive vs unproductive time for last week',
          'Which team had the highest productivity?',
          'Compare billable vs non-billable project time',
        ],
      },
      {
        category: 'Trends',
        queries: [
          'Show productivity trends for the last 30 days',
          'How has idle time changed over the past month?',
          'What is the trend in project time allocation?',
        ],
      },
      {
        category: 'Drill-down',
        queries: [
          'Which applications were used most yesterday?',
          'Top 10 users by productive hours this week',
          'Break down time by project for last month',
        ],
      },
    ],
  });
});

export default router;
