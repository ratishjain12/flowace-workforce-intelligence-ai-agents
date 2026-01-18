import { query } from '../config/database';

export interface AuditLogEntry {
  agentType: 'chat' | 'classification';
  userId: string;
  queryText: string;
  response?: string;
  sqlGenerated?: string;
  dataAccessed?: string[];
  executionTimeMs?: number;
  success?: boolean;
  errorMessage?: string;
}

export async function logAgentAction(entry: AuditLogEntry): Promise<string> {
  const result = await query(
    `INSERT INTO agent_audit_log
     (agent_type, user_id, query, response, sql_generated, data_accessed, execution_time_ms, success, error_message)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING id`,
    [
      entry.agentType,
      entry.userId,
      entry.queryText,
      entry.response || null,
      entry.sqlGenerated || null,
      entry.dataAccessed || [],
      entry.executionTimeMs || null,
      entry.success ?? true,
      entry.errorMessage || null,
    ]
  );

  return result.rows[0].id;
}

export async function getAuditLogs(
  options: {
    agentType?: string;
    userId?: string;
    startDate?: Date;
    endDate?: Date;
    limit?: number;
    offset?: number;
  } = {}
): Promise<any[]> {
  const conditions: string[] = [];
  const params: any[] = [];
  let paramIndex = 1;

  if (options.agentType) {
    conditions.push(`agent_type = $${paramIndex++}`);
    params.push(options.agentType);
  }

  if (options.userId) {
    conditions.push(`user_id = $${paramIndex++}`);
    params.push(options.userId);
  }

  if (options.startDate) {
    conditions.push(`timestamp >= $${paramIndex++}`);
    params.push(options.startDate);
  }

  if (options.endDate) {
    conditions.push(`timestamp <= $${paramIndex++}`);
    params.push(options.endDate);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const limit = options.limit || 100;
  const offset = options.offset || 0;

  const result = await query(
    `SELECT * FROM agent_audit_log
     ${whereClause}
     ORDER BY timestamp DESC
     LIMIT $${paramIndex++} OFFSET $${paramIndex++}`,
    [...params, limit, offset]
  );

  return result.rows;
}
