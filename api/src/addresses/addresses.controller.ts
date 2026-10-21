import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  ParseUUIDPipe,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { AddressesService } from './addresses.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ActiveUserGuard } from '../auth/guards/active-user.guard';
import { CreateAddressDto, UpdateAddressDto } from '@arkan-gold/shared';

interface AuthenticatedRequest extends Request {
  user: { userId: string; phone: string; sessionId: string };
}

@ApiTags('Addresses')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, ActiveUserGuard)
@Controller('users/me/addresses')
export class AddressesController {
  constructor(private readonly addressesService: AddressesService) {}

  @Get()
  @ApiOperation({ summary: 'لیست آدرس‌های کاربر' })
  list(@Req() req: AuthenticatedRequest) {
    return this.addressesService.list(req.user.userId);
  }

  @Post()
  @ApiOperation({ summary: 'افزودن آدرس جدید' })
  create(@Req() req: AuthenticatedRequest, @Body() dto: CreateAddressDto) {
    return this.addressesService.create(req.user.userId, dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'ویرایش آدرس' })
  update(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAddressDto,
  ) {
    return this.addressesService.update(req.user.userId, id, dto);
  }

  @Post(':id/default')
  @ApiOperation({ summary: 'انتخاب آدرس پیش‌فرض' })
  setDefault(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.addressesService.setDefault(req.user.userId, id);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'حذف آدرس' })
  remove(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.addressesService.remove(req.user.userId, id);
  }
}
