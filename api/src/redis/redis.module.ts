import { Global, Logger, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: 'REDIS_CLIENT',
      useFactory: (configService: ConfigService) => {
        const password =
          configService.get<string>('REDIS_PASSWORD', '') || undefined;
        if (process.env.NODE_ENV === 'production' && !password) {
          new Logger('RedisModule').warn(
            'REDIS_PASSWORD تنظیم نشده؛ Redis (کدهای OTP، مراحل ورود، شمارنده‌های قفل) بدون احراز هویت است',
          );
        }
        return new Redis({
          host: configService.get<string>('REDIS_HOST', 'localhost'),
          port: configService.get<number>('REDIS_PORT', 6379),
          password,
          // FCS — رمزنگاری ارتباط با Redis وقتی سرویس Redis خارج از شبکه‌ی خصوصی است
          tls: process.env.REDIS_TLS === 'true' ? {} : undefined,
        });
      },
      inject: [ConfigService],
    },
  ],
  exports: ['REDIS_CLIENT'],
})
export class RedisModule {}
