import { Injectable, BadRequestException } from '@nestjs/common';
import Redis from 'ioredis';
import { randomInt, createHash } from 'crypto';

@Injectable()
export class OtpService {
  private redis = new Redis(process.env.REDIS_URL!);

  generateCode(): string {
    return randomInt(100000, 999999).toString();
  }

  private hash(code: string) {
    return createHash('sha256').update(code).digest('hex');
  }

  async sendOtp(mobile: string) {
    const rateKey = `otp_rate:${mobile}`;
    const count = await this.redis.incr(rateKey);

    if (count === 1) {
      await this.redis.expire(rateKey, 60);
    }

    if (count > 3) {
      throw new BadRequestException('درخواست بیش از حد');
    }

    const code = this.generateCode();

    const key = `otp:${mobile}`;
    const attemptsKey = `otp_attempts:${mobile}`;

    await this.redis.set(key, this.hash(code), 'EX', 120);
    await this.redis.set(attemptsKey, 0, 'EX', 120);

    // smsService.send(mobile, code)

    return true;
  }

  async verifyOtp(mobile: string, code: string) {
    const key = `otp:${mobile}`;
    const attemptsKey = `otp_attempts:${mobile}`;

    const stored = await this.redis.get(key);

    if (!stored) {
      throw new BadRequestException('OTP منقضی شده');
    }

    const attempts = await this.redis.incr(attemptsKey);

    if (attempts > 5) {
      await this.redis.del(key);
      throw new BadRequestException('تلاش بیش از حد');
    }

    if (stored !== this.hash(code)) {
      throw new BadRequestException('OTP اشتباه');
    }

    await this.redis.del(key);
    await this.redis.del(attemptsKey);

    return true;
  }
}
