import type { StaffRole } from "./rbac.js";

export type { StaffRole };

export type StaffAccountStatus = "active" | "disabled";

export interface StaffUser {
  id: string;
  email: string;
  passwordHash: string;
  role: StaffRole;
  status: StaffAccountStatus;
  createdAt: Date;
}

export interface StaffSession {
  id: string;
  staffUserId: string;
  tokenHash: string;
  createdAt: Date;
  expiresAt: Date;
  revokedAt: Date | null;
}

export interface CreateStaffUserInput {
  email: string;
  password: string;
  role: StaffRole;
}
