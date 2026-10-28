// api/src/livechat/livechat-admin.controller.ts
//
// میز کار اپراتورها و مدیریت چت آنلاین در پنل.
//   livechat.view      پذیرش و پاسخ به گفتگوهای صف و گفتگوهای خود، پاسخ‌های سریع شخصی
//   livechat.view_all  مشاهده و نظارت بر همه‌ی گفتگوها، انتقال/بستن گفتگوی دیگران
//   livechat.manage    تنظیمات، منوی ربات، پایگاه دانش، دپارتمان‌ها، اپراتورها، پیام خودکار
//   livechat.reports   گزارش‌ها
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  Req,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import type { Request, Response } from 'express';
import { AdminJwtAuthGuard } from '../admin-auth/guards/admin-jwt-auth.guard';
import { AdminPermissionGuard } from '../admin-auth/guards/admin-permission.guard';
import { RequirePermission } from '../admin-auth/decorators/require-permission.decorator';
import { AuditLogInterceptor } from '../admin-auth/interceptors/audit-log.interceptor';
import { AuditLog } from '../admin-auth/decorators/audit-log.decorator';
import { AdminAuthenticatedUser } from '../admin-auth/interfaces/admin-jwt-payload.interface';
import { contentDisposition } from '../common/file-security/content-disposition';
import { LivechatService } from './livechat.service';
import { LivechatAdminService } from './livechat-admin.service';
import { LivechatOperatorsService } from './livechat-operators.service';
import { LivechatSettingsService } from './livechat-settings.service';
import {
  BanVisitorDto,
  BotNodeDto,
  CannedResponseDto,
  DepartmentDto,
  KnowledgeItemDto,
  ListConversationsQuery,
  ManageOperatorDto,
  MessagesQueryDto,
  OperatorMessageDto,
  OperatorProfileDto,
  OperatorStatusDto,
  ReorderDto,
  ReportQueryDto,
  SmartTestDto,
  StartChatDto,
  TransferDto,
  TriggerDto,
  UpdateBotNodeDto,
  UpdateCannedResponseDto,
  UpdateConversationDto,
  UpdateDepartmentDto,
  UpdateKnowledgeItemDto,
  UpdateTriggerDto,
  UpdateVisitorDto,
} from './livechat.dto';

interface AdminRequest extends Request {
  user: AdminAuthenticatedUser;
}

@UseGuards(AdminJwtAuthGuard, AdminPermissionGuard)
@UseInterceptors(AuditLogInterceptor)
@Controller('admin/livechat')
export class LivechatAdminController {
  constructor(
    private readonly livechat: LivechatService,
    private readonly admin: LivechatAdminService,
    private readonly operators: LivechatOperatorsService,
    private readonly settings: LivechatSettingsService,
  ) {}

  private actor(req: AdminRequest) {
    return this.operators.actorFor(req.user);
  }

  private canManage(req: AdminRequest) {
    return req.user.permissions.includes('livechat.manage');
  }

  // ── اپراتور ──

  @RequirePermission('livechat.view')
  @Post('socket-ticket')
  socketTicket(@Req() req: AdminRequest) {
    return this.operators.issueTicket(req.user);
  }

  @RequirePermission('livechat.view')
  @Get('me')
  me(@Req() req: AdminRequest) {
    return this.operators.me(req.user);
  }

  @RequirePermission('livechat.view')
  @Patch('me')
  updateMe(@Req() req: AdminRequest, @Body() dto: OperatorProfileDto) {
    return this.operators.updateMe(req.user, dto);
  }

  @RequirePermission('livechat.view')
  @Post('me/status')
  async setStatus(@Req() req: AdminRequest, @Body() dto: OperatorStatusDto) {
    const actor = await this.actor(req);
    return this.operators.setStatus(actor.operatorId, dto.status);
  }

  @RequirePermission('livechat.view')
  @Get('presence')
  presence() {
    return this.operators.presence();
  }

  @RequirePermission('livechat.view')
  @Get('bootstrap')
  async bootstrap(@Req() req: AdminRequest) {
    const actor = await this.actor(req);
    const [me, counts, canned, departments, presence, settings] =
      await Promise.all([
        this.operators.me(req.user),
        this.admin.counts(actor),
        this.admin.canned(actor),
        this.admin.departments(),
        this.operators.presence(),
        this.settings.get(),
      ]);
    return {
      me,
      counts,
      canned,
      departments: departments.filter((d) => d.isActive),
      presence,
      settings: {
        typingPreview: settings.privacy.typingPreview,
        soundEnabled: settings.widget.soundEnabled,
      },
    };
  }

  // ── گفتگوها ──

  @RequirePermission('livechat.view')
  @Get('conversations')
  async list(@Req() req: AdminRequest, @Query() q: ListConversationsQuery) {
    return this.admin.listConversations(await this.actor(req), q);
  }

  @RequirePermission('livechat.view')
  @Get('counts')
  async counts(@Req() req: AdminRequest) {
    return this.admin.counts(await this.actor(req));
  }

  @RequirePermission('livechat.view')
  @Get('conversations/:id')
  async detail(
    @Req() req: AdminRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.admin.conversationDetail(await this.actor(req), id);
  }

  @RequirePermission('livechat.view')
  @Get('conversations/:id/messages')
  async messages(
    @Req() req: AdminRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() q: MessagesQueryDto,
  ) {
    return this.admin.messages(await this.actor(req), id, q.before);
  }

  @RequirePermission('livechat.view')
  @Post('conversations/:id/messages')
  async send(
    @Req() req: AdminRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: OperatorMessageDto,
  ) {
    return this.livechat.operatorSend(await this.actor(req), id, dto);
  }

  @RequirePermission('livechat.view')
  @Post('conversations/:id/upload')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 5 * 1024 * 1024, files: 1 },
    }),
  )
  async upload(
    @Req() req: AdminRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: OperatorMessageDto,
  ) {
    return this.livechat.operatorSend(await this.actor(req), id, dto, file, {
      adminUserId: req.user.adminUserId,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
  }

  @RequirePermission('livechat.view')
  @Get('attachments/:messageId')
  async attachment(
    @Req() req: AdminRequest,
    @Param('messageId', ParseUUIDPipe) messageId: string,
    @Res() res: Response,
  ) {
    const f = await this.livechat.attachment(messageId, {
      actor: await this.actor(req),
    });
    res.setHeader('Content-Type', f.mime);
    res.setHeader('Content-Disposition', contentDisposition(f.name));
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.send(f.buffer);
  }

  @RequirePermission('livechat.view')
  @Post('conversations/:id/claim')
  async claim(
    @Req() req: AdminRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.livechat.claim(await this.actor(req), id);
  }

  @RequirePermission('livechat.view')
  @AuditLog('livechat.transfer')
  @Post('conversations/:id/transfer')
  async transfer(
    @Req() req: AdminRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: TransferDto,
  ) {
    return this.livechat.transfer(await this.actor(req), id, dto);
  }

  @RequirePermission('livechat.view')
  @Post('conversations/:id/close')
  async close(
    @Req() req: AdminRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.livechat.operatorClose(await this.actor(req), id);
  }

  @RequirePermission('livechat.view')
  @Post('conversations/:id/seen')
  async seen(@Req() req: AdminRequest, @Param('id', ParseUUIDPipe) id: string) {
    await this.livechat.operatorSeen(await this.actor(req), id);
    return { ok: true };
  }

  @RequirePermission('livechat.view')
  @Patch('conversations/:id')
  async updateConversation(
    @Req() req: AdminRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateConversationDto,
  ) {
    return this.admin.updateConversation(await this.actor(req), id, dto);
  }

  // ── بازدیدکنندگان ──

  @RequirePermission('livechat.view')
  @Get('visitors/online')
  onlineVisitors() {
    return this.admin.onlineVisitors();
  }

  @RequirePermission('livechat.view')
  @Get('visitors/:id')
  visitor(@Param('id', ParseUUIDPipe) id: string) {
    return this.admin.visitorProfile(id);
  }

  @RequirePermission('livechat.view')
  @Patch('visitors/:id')
  updateVisitor(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateVisitorDto,
  ) {
    return this.admin.updateVisitor(id, dto);
  }

  @RequirePermission('livechat.view')
  @AuditLog('livechat.visitor_ban')
  @Post('visitors/:id/ban')
  ban(@Param('id', ParseUUIDPipe) id: string, @Body() dto: BanVisitorDto) {
    return this.admin.setBan(id, dto.banned, dto.reason);
  }

  @RequirePermission('livechat.view')
  @Post('visitors/:id/start')
  async start(
    @Req() req: AdminRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: StartChatDto,
  ) {
    return this.livechat.operatorStart(await this.actor(req), id, dto.text);
  }

  // ── پاسخ‌های سریع ──

  @RequirePermission('livechat.view')
  @Get('canned')
  async canned(@Req() req: AdminRequest) {
    return this.admin.canned(await this.actor(req));
  }

  @RequirePermission('livechat.view')
  @Post('canned')
  async createCanned(@Req() req: AdminRequest, @Body() dto: CannedResponseDto) {
    return this.admin.createCanned(
      await this.actor(req),
      dto,
      this.canManage(req),
    );
  }

  @RequirePermission('livechat.view')
  @Patch('canned/:id')
  async updateCanned(
    @Req() req: AdminRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCannedResponseDto,
  ) {
    return this.admin.updateCanned(
      await this.actor(req),
      id,
      dto,
      this.canManage(req),
    );
  }

  @RequirePermission('livechat.view')
  @Delete('canned/:id')
  async deleteCanned(
    @Req() req: AdminRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.admin.deleteCanned(
      await this.actor(req),
      id,
      this.canManage(req),
    );
  }

  @RequirePermission('livechat.view')
  @Post('canned/:id/use')
  useCanned(@Param('id', ParseUUIDPipe) id: string) {
    return this.admin.useCanned(id);
  }

  // ── تنظیمات ──

  @RequirePermission('livechat.manage')
  @Get('settings')
  getSettings() {
    return this.settings.get();
  }

  @RequirePermission('livechat.manage')
  @AuditLog('livechat.settings_update')
  @Put('settings')
  async updateSettings(
    @Req() req: AdminRequest,
    @Body() body: Record<string, unknown>,
  ) {
    const s = await this.settings.update(body, req.user.adminUserId);
    await this.livechat.broadcastAvailability();
    return s;
  }

  // ── دپارتمان‌ها و اپراتورها ──

  @RequirePermission('livechat.view')
  @Get('departments')
  departments() {
    return this.admin.departments();
  }

  @RequirePermission('livechat.manage')
  @AuditLog('livechat.department_create')
  @Post('departments')
  createDepartment(@Body() dto: DepartmentDto) {
    return this.admin.createDepartment(dto);
  }

  @RequirePermission('livechat.manage')
  @AuditLog('livechat.department_update')
  @Patch('departments/:id')
  updateDepartment(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateDepartmentDto,
  ) {
    return this.admin.updateDepartment(id, dto);
  }

  @RequirePermission('livechat.manage')
  @AuditLog('livechat.department_delete')
  @Delete('departments/:id')
  deleteDepartment(@Param('id', ParseUUIDPipe) id: string) {
    return this.admin.deleteDepartment(id);
  }

  @RequirePermission('livechat.view')
  @Get('operators')
  operatorsList() {
    return this.operators.list();
  }

  @RequirePermission('livechat.manage')
  @AuditLog('livechat.operator_update')
  @Patch('operators/:id')
  updateOperator(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ManageOperatorDto,
  ) {
    return this.operators.update(id, dto);
  }

  // ── منوی ربات ──

  @RequirePermission('livechat.manage')
  @Get('bot-nodes')
  botNodes() {
    return this.admin.botNodes();
  }

  @RequirePermission('livechat.manage')
  @AuditLog('livechat.bot_node_create')
  @Post('bot-nodes')
  createBotNode(@Body() dto: BotNodeDto) {
    return this.admin.createBotNode(dto);
  }

  @RequirePermission('livechat.manage')
  @Post('bot-nodes/reorder')
  reorderBotNodes(@Body() dto: ReorderDto) {
    return this.admin.reorderBotNodes(dto.ids);
  }

  @RequirePermission('livechat.manage')
  @AuditLog('livechat.bot_node_update')
  @Patch('bot-nodes/:id')
  updateBotNode(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateBotNodeDto,
  ) {
    return this.admin.updateBotNode(id, dto);
  }

  @RequirePermission('livechat.manage')
  @AuditLog('livechat.bot_node_delete')
  @Delete('bot-nodes/:id')
  deleteBotNode(@Param('id', ParseUUIDPipe) id: string) {
    return this.admin.deleteBotNode(id);
  }

  // ── پایگاه دانش (حالت هوشمند) ──

  @RequirePermission('livechat.manage')
  @Get('knowledge')
  knowledge() {
    return this.admin.knowledge();
  }

  @RequirePermission('livechat.manage')
  @AuditLog('livechat.knowledge_create')
  @Post('knowledge')
  createKnowledge(@Body() dto: KnowledgeItemDto) {
    return this.admin.createKnowledge(dto);
  }

  @RequirePermission('livechat.manage')
  @Post('knowledge/test')
  async testKnowledge(@Body() dto: SmartTestDto) {
    return this.admin.testSmart(dto.text, (await this.settings.get()).smart);
  }

  @RequirePermission('livechat.manage')
  @AuditLog('livechat.knowledge_update')
  @Patch('knowledge/:id')
  updateKnowledge(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateKnowledgeItemDto,
  ) {
    return this.admin.updateKnowledge(id, dto);
  }

  @RequirePermission('livechat.manage')
  @AuditLog('livechat.knowledge_delete')
  @Delete('knowledge/:id')
  deleteKnowledge(@Param('id', ParseUUIDPipe) id: string) {
    return this.admin.deleteKnowledge(id);
  }

  @RequirePermission('livechat.manage')
  @Get('unanswered')
  unanswered() {
    return this.admin.unanswered();
  }

  @RequirePermission('livechat.manage')
  @Post('unanswered/:id/resolve')
  resolveUnanswered(@Param('id', ParseUUIDPipe) id: string) {
    return this.admin.resolveUnanswered(id);
  }

  // ── پیام‌های خودکار ──

  @RequirePermission('livechat.manage')
  @Get('triggers')
  triggers() {
    return this.admin.triggers();
  }

  @RequirePermission('livechat.manage')
  @AuditLog('livechat.trigger_create')
  @Post('triggers')
  createTrigger(@Body() dto: TriggerDto) {
    return this.admin.createTrigger(dto);
  }

  @RequirePermission('livechat.manage')
  @AuditLog('livechat.trigger_update')
  @Patch('triggers/:id')
  updateTrigger(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTriggerDto,
  ) {
    return this.admin.updateTrigger(id, dto);
  }

  @RequirePermission('livechat.manage')
  @AuditLog('livechat.trigger_delete')
  @Delete('triggers/:id')
  deleteTrigger(@Param('id', ParseUUIDPipe) id: string) {
    return this.admin.deleteTrigger(id);
  }

  // ── گزارش‌ها ──

  @RequirePermission('livechat.reports')
  @Get('reports')
  reports(@Query() q: ReportQueryDto) {
    return this.admin.reports(q.from, q.to);
  }
}
