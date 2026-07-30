import type { StaffSession, StaffUser } from "./staffTypes.js";

export interface StaffAuthRepository {
  createStaffUser(user: StaffUser): Promise<void>;
  getStaffUserByEmail(email: string): Promise<StaffUser | null>;
  getStaffUserById(id: string): Promise<StaffUser | null>;
  listStaffUsers(): Promise<StaffUser[]>;
  setStaffUserStatus(id: string, status: StaffUser["status"]): Promise<void>;

  createSession(session: StaffSession): Promise<void>;
  getSessionById(id: string): Promise<StaffSession | null>;
  revokeSession(id: string): Promise<void>;
}
