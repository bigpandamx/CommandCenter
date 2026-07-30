import type { AgentsRepository } from "../src/repository.js";
import type { AgentStats, AgentTask, TaskSearchQuery, TaskStatus } from "../src/types.js";

const PRIORITY_ORDER: Record<AgentTask["priority"], number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

export class FakeAgentsRepository implements AgentsRepository {
  tasks = new Map<string, AgentTask>();
  agentRuns = new Map<string, { total: number; successful: number }>();

  async createTask(task: AgentTask) {
    this.tasks.set(task.id, task);
  }

  async getTaskById(id: string) {
    return this.tasks.get(id) ?? null;
  }

  async updateTask(task: AgentTask) {
    this.tasks.set(task.id, task);
  }

  async searchTasks(query: TaskSearchQuery) {
    let matches = [...this.tasks.values()];
    if (query.capability) matches = matches.filter((t) => t.capability === query.capability);
    if (query.status) matches = matches.filter((t) => t.status === query.status);
    matches = matches.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    return query.limit ? matches.slice(0, query.limit) : matches;
  }

  async countTasksByStatus(status: TaskStatus) {
    return [...this.tasks.values()].filter((t) => t.status === status).length;
  }

  async getNextQueuedTask() {
    const queued = [...this.tasks.values()].filter((t) => t.status === "queued");
    if (queued.length === 0) return null;
    queued.sort((a, b) => {
      const priorityDiff = PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
      if (priorityDiff !== 0) return priorityDiff;
      return a.createdAt.getTime() - b.createdAt.getTime(); // oldest first within the same priority
    });
    return queued[0] as AgentTask;
  }

  async recordAgentRun(agentId: string, success: boolean) {
    const existing = this.agentRuns.get(agentId) ?? { total: 0, successful: 0 };
    existing.total += 1;
    if (success) existing.successful += 1;
    this.agentRuns.set(agentId, existing);
  }

  async getAgentStats(agentId: string): Promise<AgentStats | null> {
    const stats = this.agentRuns.get(agentId);
    if (!stats) return null;
    return {
      agentId,
      totalTasks: stats.total,
      successfulTasks: stats.successful,
      failedTasks: stats.total - stats.successful,
      successRate: stats.total === 0 ? 0 : stats.successful / stats.total,
    };
  }
}
