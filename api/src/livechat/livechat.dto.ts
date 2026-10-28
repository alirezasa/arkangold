// api/src/livechat/livechat.dto.ts
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { PartialType } from '@nestjs/swagger';
import { LivechatBotAction, LivechatOperatorStatus } from '../generated/prisma';

const AUDIENCES = ['ALL', 'USER', 'GUEST'] as const;

// ── بازدیدکننده ──

export class VisitorSessionDto {
  @IsOptional() @IsString() @MaxLength(200) token?: string;
  @IsOptional() @IsString() @MaxLength(1000) url?: string;
  @IsOptional() @IsString() @MaxLength(300) title?: string;
  @IsOptional() @IsString() @MaxLength(1000) referrer?: string;
}

// ── اپراتور ──

export class ListConversationsQuery {
  @IsOptional()
  @IsIn(['queue', 'offline', 'mine', 'open', 'bot', 'closed', 'all'])
  view?: 'queue' | 'offline' | 'mine' | 'open' | 'bot' | 'closed' | 'all';
  @IsOptional() @IsString() @MaxLength(100) search?: string;
  @IsOptional() @IsUUID() departmentId?: string;
  @IsOptional() @IsUUID() operatorId?: string;
  @IsOptional() @IsUUID() visitorId?: string;
  @IsOptional() @IsUUID() cursor?: string;
}

export class OperatorMessageDto {
  @IsOptional() @IsString() @MaxLength(5000) text?: string;
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  isInternal?: boolean;
  @IsOptional() @IsString() @MaxLength(64) clientMessageId?: string;
}

export class TransferDto {
  @IsOptional() @IsUUID() operatorId?: string;
  @IsOptional() @IsUUID() departmentId?: string;
  @IsOptional() @IsString() @MaxLength(1000) note?: string;
}

export class UpdateConversationDto {
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(40, { each: true })
  tags?: string[];
  @IsOptional() @IsString() @MaxLength(200) subject?: string | null;
}

export class UpdateVisitorDto {
  @IsOptional() @IsString() @MaxLength(120) name?: string | null;
  @IsOptional() @IsString() @MaxLength(20) phone?: string | null;
  @IsOptional() @IsString() @MaxLength(200) email?: string | null;
  @IsOptional() @IsString() @MaxLength(3000) notes?: string | null;
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @IsString({ each: true })
  @MaxLength(40, { each: true })
  tags?: string[];
}

export class BanVisitorDto {
  @IsBoolean() banned!: boolean;
  @IsOptional() @IsString() @MaxLength(300) reason?: string;
}

export class StartChatDto {
  @IsString() @MinLength(1) @MaxLength(5000) text!: string;
}

export class OperatorStatusDto {
  @IsEnum(LivechatOperatorStatus) status!: LivechatOperatorStatus;
}

export class OperatorProfileDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(60) displayName?: string;
  @IsOptional() @IsString() @MaxLength(60) title?: string | null;
  /** تصویر روی همین سایت (مسیر /...) یا https؛ CSP اپ تصویر دامنه‌های دیگر را بارگذاری نمی‌کند */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  @Matches(/^(\/(?!\/)|https:\/\/)\S*$/, {
    message: 'نشانی تصویر باید با / یا https:// شروع شود',
  })
  avatarUrl?: string | null;
  @IsOptional() @IsInt() @Min(1) @Max(50) maxConcurrentChats?: number;
  @IsOptional() @IsBoolean() acceptsAutoAssign?: boolean;
}

export class ManageOperatorDto extends OperatorProfileDto {
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsUUID('all', { each: true })
  departmentIds?: string[];
}

// ── مدیریت محتوا ──

export class DepartmentDto {
  @IsString() @MinLength(2) @MaxLength(80) name!: string;
  @IsOptional() @IsString() @MaxLength(300) description?: string | null;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @IsInt() @Min(0) @Max(10000) sortOrder?: number;
}

export class CannedResponseDto {
  @IsString() @MinLength(1) @MaxLength(40) shortcut!: string;
  @IsString() @MinLength(1) @MaxLength(120) title!: string;
  @IsString() @MinLength(1) @MaxLength(5000) body!: string;
  @IsOptional() @IsUUID() departmentId?: string | null;
  /** مشترک بین همه‌ی اپراتورها (پیش‌فرض) یا شخصی */
  @IsOptional() @IsBoolean() shared?: boolean;
  @IsOptional() @IsInt() @Min(0) @Max(10000) sortOrder?: number;
}

export class BotNodeDto {
  @IsOptional() @IsUUID() parentId?: string | null;
  @IsString() @MinLength(1) @MaxLength(120) label!: string;
  @IsEnum(LivechatBotAction) action!: LivechatBotAction;
  @IsOptional() @IsString() @MaxLength(4000) replyText?: string | null;
  @IsOptional() @IsString() @MaxLength(500) url?: string | null;
  @IsOptional() @IsUUID() departmentId?: string | null;
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @IsString({ each: true })
  @MaxLength(80, { each: true })
  keywords?: string[];
  @IsOptional() @IsString() @MaxLength(8) icon?: string | null;
  @IsOptional() @IsIn(AUDIENCES) audience?: (typeof AUDIENCES)[number];
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @IsInt() @Min(0) @Max(10000) sortOrder?: number;
}

export class ReorderDto {
  @IsArray() @ArrayMaxSize(200) @IsUUID('all', { each: true }) ids!: string[];
}

export class KnowledgeItemDto {
  @IsString() @MinLength(2) @MaxLength(300) question!: string;
  @IsString() @MinLength(1) @MaxLength(5000) answer!: string;
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  @MaxLength(300, { each: true })
  variants?: string[];
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @IsString({ each: true })
  @MaxLength(80, { each: true })
  keywords?: string[];
  @IsOptional() @IsUUID() followUpNodeId?: string | null;
  @IsOptional() @IsBoolean() isActive?: boolean;
  /** ساخته‌شده از روی یک پرسش بی‌پاسخ (آن پرسش حل‌شده علامت می‌خورد) */
  @IsOptional() @IsUUID() fromUnansweredId?: string;
}

export class SmartTestDto {
  @IsString() @MinLength(1) @MaxLength(500) text!: string;
}

export class TriggerDto {
  @IsString() @MinLength(2) @MaxLength(80) name!: string;
  @IsString() @MinLength(1) @MaxLength(1000) message!: string;
  @IsOptional() @IsString() @MaxLength(200) urlContains?: string | null;
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(3600)
  delaySeconds?: number;
  @IsOptional() @IsIn(AUDIENCES) audience?: (typeof AUDIENCES)[number];
  @IsOptional() @IsBoolean() onlyWhenOnline?: boolean;
  @IsOptional() @IsBoolean() openWidget?: boolean;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @IsInt() @Min(0) @Max(10000) sortOrder?: number;
}

export class ReportQueryDto {
  @IsOptional() @IsString() @MaxLength(40) from?: string;
  @IsOptional() @IsString() @MaxLength(40) to?: string;
}

export class MessagesQueryDto {
  @IsOptional() @IsString() @MaxLength(40) before?: string;
}

export class UpdateDepartmentDto extends PartialType(DepartmentDto) {}
export class UpdateCannedResponseDto extends PartialType(CannedResponseDto) {}
export class UpdateBotNodeDto extends PartialType(BotNodeDto) {}
export class UpdateKnowledgeItemDto extends PartialType(KnowledgeItemDto) {}
export class UpdateTriggerDto extends PartialType(TriggerDto) {}
