import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { query } from '../config/database';
import { generateToken } from '../middleware/auth';

const router = Router();

/**
 * POST /api/auth/login
 * Authenticate user and return JWT token
 */
router.post('/login', async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      res.status(400).json({ error: 'Email and password are required' });
      return;
    }

    const result = await query(
      'SELECT id, email, name, role, team_id, password_hash FROM users WHERE email = $1',
      [email]
    );

    if (result.rows.length === 0) {
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    const user = result.rows[0];
    const validPassword = await bcrypt.compare(password, user.password_hash);

    if (!validPassword) {
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    const token = generateToken({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      team_id: user.team_id,
    });

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        team_id: user.team_id,
      },
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/auth/me
 * Get current user info (requires auth)
 */
router.get('/me', async (req: Request, res: Response): Promise<void> => {
  try {
    // This would normally use authMiddleware, but for simplicity:
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      res.status(401).json({ error: 'No token provided' });
      return;
    }

    // Decode token and fetch user
    const jwt = require('jsonwebtoken');
    const token = authHeader.substring(7);
    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET || 'dev-secret-change-in-production'
    ) as any;

    const result = await query(
      `SELECT u.id, u.email, u.name, u.role, u.team_id, t.name as team_name
       FROM users u
       JOIN teams t ON u.team_id = t.id
       WHERE u.id = $1`,
      [decoded.id]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Auth error:', error);
    res.status(401).json({ error: 'Invalid token' });
  }
});

/**
 * GET /api/auth/users
 * List users (for testing/demo purposes)
 */
router.get('/users', async (_req: Request, res: Response): Promise<void> => {
  try {
    const result = await query(
      `SELECT u.id, u.email, u.name, u.role, t.name as team_name
       FROM users u
       JOIN teams t ON u.team_id = t.id
       ORDER BY u.role, u.name
       LIMIT 20`
    );

    res.json({
      message: 'Sample users (password is "password123" for all)',
      users: result.rows,
    });
  } catch (error) {
    console.error('Users list error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
