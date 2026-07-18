// api/src/admin-auth/decorators/audit-log.decorator.ts
import { SetMetadata } from '@nestjs/common';
export const AUDIT_ACTION_KEY = 'auditAction';
export const AuditLog = (action: string) =>
  SetMetadata(AUDIT_ACTION_KEY, action);
