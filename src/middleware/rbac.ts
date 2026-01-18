import { AuthenticatedUser } from './auth';

export interface RBACFilter {
  userFilter: string;
  teamFilter: string;
  params: any[];
}

/**
 * Generate SQL WHERE clauses based on user role
 * - Admin: Can see all data
 * - Manager: Can see their team's data
 * - Employee: Can see only their own data
 */
export function getRBACFilters(user: AuthenticatedUser, paramOffset: number = 0): RBACFilter {
  switch (user.role) {
    case 'admin':
      // Admins can see everything
      return {
        userFilter: '1=1',
        teamFilter: '1=1',
        params: [],
      };

    case 'manager':
      // Managers can see their team's data
      return {
        userFilter: `user_id IN (SELECT id FROM users WHERE team_id = $${paramOffset + 1})`,
        teamFilter: `team_id = $${paramOffset + 1}`,
        params: [user.team_id],
      };

    case 'employee':
      // Employees can only see their own data
      return {
        userFilter: `user_id = $${paramOffset + 1}`,
        teamFilter: `team_id = $${paramOffset + 1}`, // Fallback, mostly use userFilter
        params: [user.id],
      };

    default:
      throw new Error(`Unknown role: ${user.role}`);
  }
}

/**
 * Check if user can access a specific user's data
 */
export async function canAccessUserData(
  requestingUser: AuthenticatedUser,
  targetUserId: string,
  pool: any
): Promise<boolean> {
  if (requestingUser.role === 'admin') {
    return true;
  }

  if (requestingUser.role === 'employee') {
    return requestingUser.id === targetUserId;
  }

  // Manager - check if target user is in their team
  const result = await pool.query(
    'SELECT 1 FROM users WHERE id = $1 AND team_id = $2',
    [targetUserId, requestingUser.team_id]
  );

  return result.rowCount > 0;
}

/**
 * Get accessible team IDs for a user
 */
export function getAccessibleTeamIds(user: AuthenticatedUser): string[] | null {
  switch (user.role) {
    case 'admin':
      return null; // null means all teams
    case 'manager':
    case 'employee':
      return [user.team_id];
    default:
      return [];
  }
}

/**
 * Build a safe SQL query with RBAC filtering
 */
export function buildRBACQuery(
  baseQuery: string,
  user: AuthenticatedUser,
  additionalParams: any[] = []
): { query: string; params: any[] } {
  const filters = getRBACFilters(user, additionalParams.length);

  // If query already has WHERE clause, add AND
  const hasWhere = baseQuery.toLowerCase().includes('where');
  const connector = hasWhere ? ' AND ' : ' WHERE ';

  // Find the table alias for user_id (assume 'u' or main table)
  const modifiedQuery = baseQuery.includes('user_id')
    ? baseQuery.replace(/WHERE|$/, `${connector}${filters.userFilter} `)
    : baseQuery;

  return {
    query: modifiedQuery,
    params: [...additionalParams, ...filters.params],
  };
}
