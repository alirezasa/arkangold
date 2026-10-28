// api/src/livechat/livechat-smart.service.ts
//
// حالت هوشمند: پیدا کردن پاسخ پرسش آزاد بازدیدکننده از پایگاه دانش و منوی ربات، کاملاً روی سرور
// خودمان (بدون ارسال گفتگوی مشتریان به سرویس بیرونی). امتیاز = بیشینه‌ی شباهت با پرسش اصلی،
// عبارت‌های مشابه و کلمات کلیدی. پاسخ مطمئن مستقیم ارسال می‌شود، پاسخ‌های محتمل به‌صورت پیشنهاد.
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  keywordScore,
  normalizePersian,
  similarity,
  tokenize,
} from './livechat-text.util';
import type { LivechatSettingsData } from './livechat-settings.types';
import type { BotOption } from './livechat.mappers';

const CACHE_MS = 60_000;

interface Candidate {
  kind: 'kb' | 'node';
  id: string;
  label: string;
  answer: string | null;
  followUpNodeId: string | null;
  refs: string[][];
  keywords: string[];
  audience: string;
}

export type SmartResult =
  | {
      kind: 'kb';
      id: string;
      answer: string;
      followUpNodeId: string | null;
      score: number;
    }
  | { kind: 'node'; id: string; score: number }
  | { kind: 'suggest'; options: BotOption[] }
  | { kind: 'none' };

@Injectable()
export class LivechatSmartService {
  private cache: { at: number; items: Candidate[] } | null = null;

  constructor(private readonly prisma: PrismaService) {}

  invalidate() {
    this.cache = null;
  }

  private async candidates(): Promise<Candidate[]> {
    if (this.cache && Date.now() - this.cache.at < CACHE_MS)
      return this.cache.items;
    const [kb, nodes] = await Promise.all([
      this.prisma.livechatKnowledgeItem.findMany({ where: { isActive: true } }),
      this.prisma.livechatBotNode.findMany({ where: { isActive: true } }),
    ]);
    const items: Candidate[] = [
      ...kb.map((k) => ({
        kind: 'kb' as const,
        id: k.id,
        label: k.question,
        answer: k.answer,
        followUpNodeId: k.followUpNodeId,
        refs: [k.question, ...k.variants].map(tokenize).filter((t) => t.length),
        keywords: k.keywords,
        audience: 'ALL',
      })),
      // گره‌های منو هم با عنوان دکمه و کلمات کلیدی‌شان قابل پیدا شدن هستند
      ...nodes
        .filter((n) => n.action !== 'MAIN_MENU' && n.action !== 'CLOSE')
        .map((n) => ({
          kind: 'node' as const,
          id: n.id,
          label: n.label,
          answer: null,
          followUpNodeId: null,
          refs: [tokenize(n.label)].filter((t) => t.length),
          keywords: n.keywords,
          audience: n.audience,
        })),
    ];
    this.cache = { at: Date.now(), items };
    return items;
  }

  score(query: string, c: Candidate): number {
    const q = tokenize(query);
    if (!q.length) return 0;
    let best = 0;
    for (const ref of c.refs) best = Math.max(best, similarity(q, ref));
    if (c.keywords.length)
      best = Math.max(best, 0.9 * keywordScore(q, c.keywords));
    // گره‌های منو (برخلاف پرسش‌های پایگاه دانش) کمی کم‌وزن‌ترند تا پاسخ دقیق‌تر برنده شود
    return c.kind === 'node' ? best * 0.92 : best;
  }

  async find(
    query: string,
    settings: LivechatSettingsData['smart'],
    isUser: boolean,
  ): Promise<SmartResult> {
    if (normalizePersian(query).length < 2) return { kind: 'none' };
    const all = (await this.candidates()).filter(
      (c) => c.audience === 'ALL' || c.audience === (isUser ? 'USER' : 'GUEST'),
    );
    const ranked = all
      .map((c) => ({ c, s: this.score(query, c) }))
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s);
    const top = ranked[0];
    if (top && top.s >= settings.minConfidence) {
      // اگر دو گزینه تقریباً هم‌امتیازند، پیشنهاد بهتر از حدس است
      const second = ranked[1];
      const ambiguous =
        second &&
        second.s >= settings.minConfidence &&
        top.s - second.s < 0.05 &&
        second.c.id !== top.c.id;
      if (!ambiguous) {
        return top.c.kind === 'kb'
          ? {
              kind: 'kb',
              id: top.c.id,
              answer: top.c.answer ?? '',
              followUpNodeId: top.c.followUpNodeId,
              score: top.s,
            }
          : { kind: 'node', id: top.c.id, score: top.s };
      }
    }
    const options: BotOption[] = ranked
      .filter((x) => x.s >= settings.suggestThreshold)
      .slice(0, settings.maxSuggestions)
      .map((x) =>
        x.c.kind === 'kb'
          ? {
              id: `kb:${x.c.id}`,
              label: x.c.label,
              kind: 'kb' as const,
              kbId: x.c.id,
            }
          : {
              id: `node:${x.c.id}`,
              label: x.c.label,
              kind: 'node' as const,
              nodeId: x.c.id,
            },
      );
    return options.length ? { kind: 'suggest', options } : { kind: 'none' };
  }

  /** ثبت پرسش بی‌پاسخ برای تکمیل پایگاه دانش */
  async logUnanswered(text: string, conversationId: string) {
    const normalized = normalizePersian(text).slice(0, 300);
    if (normalized.length < 3) return;
    await this.prisma.livechatUnanswered
      .upsert({
        where: { normalized },
        create: { text: text.slice(0, 500), normalized, conversationId },
        update: {
          count: { increment: 1 },
          lastAskedAt: new Date(),
          resolvedAt: null,
          conversationId,
        },
      })
      .catch(() => undefined);
  }
}
