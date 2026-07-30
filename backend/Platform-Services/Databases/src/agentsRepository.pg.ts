import type { Pool } from "pg";
import type { AgentsRepository } from "../../../Control-Plane/Agents/src/repository.js";
import type { AgentStats, AgentTask, TaskSearchQuery, TaskStatus } from "../../../Control-Plane/Agents/src/types.js";

export class PgAgentsRepository implements AgentsRepository {
  constructor(private readonly pool: Pool) {}

  async createTask(task: AgentTask): Promise<void> {
    await this.pool.query(
      `INSERT INTO agent_tasks (id, capability, priority, payload, status, created_at, started_at, completed_at, result, error)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [
        task.id,
        task.capability,
        task.priority,
        JSON.stringify(task.payload),
        task.status,
        task.createdAt,
        task.startedAt,
        task.completedAt,
        task.result ? JSON.stringify(task.result) : null,
        task.error,
      ],
    );
  }

  async getTaskById(id: string): Promise<AgentTask | null> {
    const { rows } = await this.pool.query(`SELECT * FROM agent_tasks WHERE id = $1`, [id]);
    return rows[0] ? mapTask(rows[0]) : null;
  }

  async updateTask(task: AgentTask): Promise<void> {
    await this.pool.query(
      `UPDATE agent_tasks SET
         status = $2, started_at = $3, completed_at = $4, result = $5, error = $6
       WHERE id = $1`,
      [
        task.id,
        task.status,
        task.startedAt,
        task.completedAt,
        task.result ? JSON.stringify(task.result) : null,
        task.error,
      ],
    );
  }

  async searchTasks(query: TaskSearchQuery): Promise<AgentTask[]> {
    const conditions: string[] = [];
    const params: unknown[] = [];
    if (query.capability) {
      params.push(query.capability);
      conditions.push(`capability = $${params.length}`);
    }
    if (query.status) {
      params.push(query.status);
      conditions.push(`status = $${params.length}`);
    }
    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const limit = query.limit ?? 100;
    params.push(limit);
    const { rows } = await this.pool.query(
      `SELECT * FROM agent_tasks ${whereClause} ORDER BY created_at DESC LIMIT $${params.length}`,
      params,
    );
    return rows.map(mapTask);
  }

  async countTasksByStatus(status: TaskStatus): Promise<number> {
    const { rows } = await this.pool.query(`SELECT COUNT(*) AS count FROM agent_tasks WHERE status = $1`, [status]);
    return Number(rows[0].count);
  }

  async getNextQueuedTask(): Promise<AgentTask | null> {
    // Priority order via a CASE expression -- CHECK constraint values
    // don't have an inherent sort order in Postgres, so this maps each
    // priority to the same 0-3 ranking the in-memory fake uses, then
    // orders by (priority rank, created_at) to match "highest priority,
    // oldest within that priority" exactly.
    const { rows } = await this.pool.query(
      `SELECT * FROM agent_tasks
       WHERE status = 'queued'
       ORDER BY
         CASE priority
           WHEN 'critical' THEN 0
           WHEN 'high' THEN 1
           WHEN 'medium' THEN 2
           WHEN 'low' THEN 3
         END,
         created_at ASC
       LIMIT 1`,
    );
    return rows[0] ? mapTask(rows[0]) : null;
  }

  async recordAgentRun(agentId: string, success: boolean): Promise<void> {
    await this.pool.query(
      `INSERT INTO agent_stats (agent_id, total_tasks, successful_tasks)
       VALUES ($1, 1, $2)
       ON CONFLICT (agent_id) DO UPDATE SET
         total_tasks = agent_stats.total_tasks + 1,
         successful_tasks = agent_stats.successful_tasks + $2`,
      [agentId, success ? 1 : 0],
    );
  }

  async getAgentStats(agentId: string): Promise<AgentStats | null> {
    const { rows } = await this.pool.query(`SELECT * FROM agent_stats WHERE agent_id = $1`, [agentId]);
    if (!rows[0]) return null;
    const totalTasks = rows[0].total_tasks;
    const successfulTasks = rows[0].successful_tasks;
    return {
      agentId,
      totalTasks,
      successfulTasks,
      failedTasks: totalTasks - successfulTasks,
      successRate: totalTasks === 0 ? 0 : successfulTasks / totalTasks,
    };
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapTask(row: any): AgentTask {
  return {
    id: row.id,
    capability: row.capability,
    priority: row.priority,
    payload: row.payload,
    status: row.status,
    createdAt: row.created_at,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    result: row.result,
    error: row.error,
  };
}
