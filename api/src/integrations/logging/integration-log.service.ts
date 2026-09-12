import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

interface BaseLogParams {
  requestId: string;
  serviceCode: string;
  providerCode: string;
  durationMs: number;
  providerRequestId?: string;
  httpStatus?: number;
}

interface FailureLogParams extends BaseLogParams {
  errorCode: string;
}

@Injectable()
export class IntegrationLogService {
  private readonly logger = new Logger(IntegrationLogService.name);

  constructor(private readonly prisma: PrismaService) {}

  async logSuccess(params: BaseLogParams) {
    await this.write({ ...params, status: 'SUCCESS' });
  }

  async logFailure(params: FailureLogParams) {
    await this.write({ ...params, status: 'FAILED' });
  }

  private async write(
    params: BaseLogParams & { status: string; errorCode?: string },
  ) {
    try {
      const [service, provider] = await Promise.all([
        this.prisma.integrationService.findUnique({ where: { code: params.serviceCode } }),
        this.prisma.integrationProvider.findUnique({ where: { code: params.providerCode } }),
      ]);

      await this.prisma.integrationLog.create({
        data: {
          requestId: params.requestId,
          serviceId: service?.id,
          providerId: provider?.id,
          status: params.status,
          httpStatus: params.httpStatus,
          providerRequestId: params.providerRequestId,
          errorCode: params.errorCode,
          durationMs: params.durationMs,
        },
      });
    } catch (err) {
      // ثبت لاگ هرگز نباید باعث Fail شدن عملیات اصلی شود (مشابه AuditLogInterceptor پروژه)
      this.logger.error('خطا در ثبت IntegrationLog', err as Error);
    }
  }
}
