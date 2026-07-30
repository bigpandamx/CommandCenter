import type { StaffAuthRepository } from "../src/staffAuthRepository.js";
import type { StaffSession, StaffUser } from "../src/staffTypes.js";

export class FakeStaffAuthRepository implements StaffAuthRepository {
  users = new Map<string, StaffUser>();
  usersByEmail = new Map<string, string>(); // email -> id
  sessions = new Map<string, StaffSession>();

  async createStaffUser(user: StaffUser) {
    this.users.set(user.id, user);
    this.usersByEmail.set(user.email, user.id);
  }

  async getStaffUserByEmail(email: string) {
    const id = this.usersByEmail.get(email);
    return id ? this.users.get(id) ?? null : null;
  }

  async getStaffUserById(id: string) {
    return this.users.get(id) ?? null;
  }

  async listStaffUsers() {
    return [...this.users.values()];
  }

  async setStaffUserStatus(id: string, status: StaffUser["status"]) {
    const u = this.users.get(id);
    if (u) u.status = status;
  }

  async createSession(session: StaffSession) {
    this.sessions.set(session.id, session);
  }

  async getSessionById(id: string) {
    return this.sessions.get(id) ?? null;
  }

  async revokeSession(id: string) {
    const s = this.sessions.get(id);
    if (s) s.revokedAt = new Date();
  }
}
