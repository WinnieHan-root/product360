import type { UserRole } from "@product360/shared";

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  canViewCommercial: boolean;
}
