// api/src/agent/agent-scope.guard.ts
//
// محدودسازی پرتال نماینده: فقط حساب ادمینی که به یک نماینده متصل است (agentId)
// اجازه‌ی عبور دارد و همه‌ی داده‌ها در سرویس‌ها با همین agentId فیلتر می‌شوند.
// حتی مدیر ارشد (که همه‌ی دسترسی‌ها را دارد) بدون اتصال به نماینده وارد پرتال نمی‌شود.
import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Request } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit/audit.service';
import { AdminAuthenticatedUser } from '../admin-auth/interfaces/admin-jwt-payload.interface';

export interface AgentPortalRequest extends Request {
  user: AdminAuthenticatedUser & { agentId: string };
  agentStatus?: string;
}

@Injectable()
export class AgentScopeGuard implements CanActivate {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<AgentPortalRequest>();
    const agentId = req.user?.agentId;
    if (!agentId) {
      void this.audit.logAdmin({
        adminUserId: req.user?.adminUserId ?? null,
        action: 'agent_portal.access_denied',
        ip: req.ip,
        userAgent: req.headers?.['user-agent'],
        source: 'AgentScopeGuard',
        success: false,
        newValue: { reason: 'not_agent_account' },
      });
      throw new ForbiddenException(
        'این حساب به هیچ نماینده‌ای متصل نیست و به پرتال نماینده دسترسی ندارد',
      );
    }
    const agent = await this.prisma.agent.findUnique({
      where: { id: agentId },
      select: { status: true },
    });
    if (!agent || agent.status === 'TERMINATED') {
      throw new ForbiddenException('همکاری این نماینده خاتمه یافته است');
    }
    req.agentStatus = agent.status;
    return true;
  }
}
