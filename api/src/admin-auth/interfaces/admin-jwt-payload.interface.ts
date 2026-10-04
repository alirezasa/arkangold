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
  /** کلید همه‌ی نقش‌های ادمین (یک ادمین می‌تواند چند نقش داشته باشد) */
  roleKeys: string[];
  permissions: string[];
  /** اگر این حساب متعلق به یک نماینده فروش باشد، شناسه‌ی همان نماینده */
  agentId: string | null;
}
