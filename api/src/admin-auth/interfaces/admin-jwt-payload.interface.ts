// api/src/admin-auth/interfaces/admin-jwt-payload.interface.ts
export interface AdminJwtPayload {
  sub: string; // adminUserId
  username: string;
  sessionId: string;
}

export interface AdminAuthenticatedUser {
  adminUserId: string;
  username: string;
  sessionId: string;
  roleKey: string;
  permissions: string[];
}
