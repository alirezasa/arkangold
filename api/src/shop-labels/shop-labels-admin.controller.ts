// api/src/shop-labels/shop-labels-admin.controller.ts
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
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AdminJwtAuthGuard } from '../admin-auth/guards/admin-jwt-auth.guard';
import { AdminPermissionGuard } from '../admin-auth/guards/admin-permission.guard';
import { RequirePermission } from '../admin-auth/decorators/require-permission.decorator';
import { AuditLog } from '../admin-auth/decorators/audit-log.decorator';
import { AuditLogInterceptor } from '../admin-auth/interceptors/audit-log.interceptor';
import { ShopLabelsService } from './shop-labels.service';
import {
  BarcodeListQueryDto,
  CreateLabelSizeDto,
  CreateLabelTemplateDto,
  GenerateBarcodesDto,
  LabelOrdersDto,
  LabelSettingsDto,
  SetBarcodeDto,
  UpdateLabelSizeDto,
  UpdateLabelTemplateDto,
} from './shop-labels.dto';

@ApiTags('Admin - Shop Labels')
@ApiBearerAuth()
@UseGuards(AdminJwtAuthGuard, AdminPermissionGuard)
@UseInterceptors(AuditLogInterceptor)
@Controller('admin/shop-labels')
export class ShopLabelsAdminController {
  constructor(private readonly service: ShopLabelsService) {}

  // ── چاپ (کاربر انبار/ارسال) ──

  @RequirePermission('shop.label.print')
  @Get('templates')
  @ApiOperation({ summary: 'طرح‌های برچسب (active=true فقط طرح‌های فعال)' })
  listTemplates(@Query('active') active?: string) {
    return this.service.listTemplates(active === 'true');
  }

  @RequirePermission('shop.label.print')
  @Post('print-data')
  @ApiOperation({ summary: 'داده‌ی چاپ برچسب سفارش‌ها' })
  printData(@Body() dto: LabelOrdersDto) {
    return this.service.printData(dto.orderIds);
  }

  @RequirePermission('shop.label.print')
  @AuditLog('shop_labels.print')
  @Post('print-log')
  @ApiOperation({ summary: 'ثبت چاپ برچسب سفارش‌ها' })
  logPrint(@Body() dto: LabelOrdersDto) {
    return this.service.logPrint(dto.orderIds);
  }

  // ── تنظیمات و طراحی ──

  @RequirePermission('shop.label.manage')
  @Get('settings')
  getSettings() {
    return this.service.getSettings();
  }

  @RequirePermission('shop.label.manage')
  @AuditLog('shop_labels.settings.update')
  @Put('settings')
  @ApiOperation({ summary: 'مشخصات فرستنده و تنظیمات بارکد' })
  updateSettings(@Body() dto: LabelSettingsDto) {
    return this.service.updateSettings(dto);
  }

  @RequirePermission('shop.label.manage')
  @Get('sizes')
  listSizes() {
    return this.service.listSizes();
  }

  @RequirePermission('shop.label.manage')
  @AuditLog('shop_labels.size.create')
  @Post('sizes')
  createSize(@Body() dto: CreateLabelSizeDto) {
    return this.service.createSize(dto);
  }

  @RequirePermission('shop.label.manage')
  @AuditLog('shop_labels.size.update')
  @Patch('sizes/:id')
  updateSize(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateLabelSizeDto,
  ) {
    return this.service.updateSize(id, dto);
  }

  @RequirePermission('shop.label.manage')
  @AuditLog('shop_labels.size.delete')
  @Delete('sizes/:id')
  removeSize(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.removeSize(id);
  }

  @RequirePermission('shop.label.print')
  @Get('templates/:id')
  getTemplate(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.getTemplate(id);
  }

  @RequirePermission('shop.label.manage')
  @AuditLog('shop_labels.template.create')
  @Post('templates')
  createTemplate(@Body() dto: CreateLabelTemplateDto) {
    return this.service.createTemplate(dto);
  }

  @RequirePermission('shop.label.manage')
  @AuditLog('shop_labels.template.update')
  @Patch('templates/:id')
  updateTemplate(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateLabelTemplateDto,
  ) {
    return this.service.updateTemplate(id, dto);
  }

  @RequirePermission('shop.label.manage')
  @AuditLog('shop_labels.template.duplicate')
  @Post('templates/:id/duplicate')
  duplicateTemplate(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.duplicateTemplate(id);
  }

  @RequirePermission('shop.label.manage')
  @AuditLog('shop_labels.template.delete')
  @Delete('templates/:id')
  removeTemplate(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.removeTemplate(id);
  }

  // ── بارکد کالاها ──

  @RequirePermission('shop.label.manage')
  @Get('barcodes')
  listBarcodes(@Query() query: BarcodeListQueryDto) {
    return this.service.listBarcodes(query);
  }

  @RequirePermission('shop.label.manage')
  @AuditLog('shop_labels.barcode.set')
  @Put('barcodes')
  setBarcode(@Body() dto: SetBarcodeDto) {
    return this.service.setBarcode(dto);
  }

  @RequirePermission('shop.label.manage')
  @AuditLog('shop_labels.barcode.generate')
  @Post('barcodes/generate')
  generateBarcodes(@Body() dto: GenerateBarcodesDto) {
    return this.service.generateMissing(dto);
  }
}
