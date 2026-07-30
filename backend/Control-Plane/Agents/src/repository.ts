import type { AgentStats, AgentTask, TaskSearchQuery, TaskStatus } from "./types.js";

export interface AgentsRepository {
  createTask(task: AgentTask): Promise<void>;
  getTaskById(id: string): Promise<AgentTask | null>;
  updateTask(task: AgentTask): Promise<void>;
  searchTasks(query: TaskSearchQuery): Promise<AgentTask[]>;
  /** A real count, not searchTasks({status}).length -- searchTasks is limit-bounded for staff-facing paging and would undercount queue depth once a backlog is larger than that. What Platform Health's queue-depth reading actually needs. */
  countTasksByStatus(status: TaskStatus): Promise<number>;
  /** The single highest-priority queued task, oldest first within the same priority -- what processNextTask pulls from. Null when the queue is empty. */
  getNextQueuedTask(): Promise<AgentTask | null>;

  recordAgentRun(agentId: string, success: boolean): Promise<void>;
  getAgentStats(agentId: string): Promise<AgentStats | null>;
}
