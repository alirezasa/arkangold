import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { CartService } from './cart.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ActiveUserGuard } from '../auth/guards/active-user.guard';
import { AddCartItemDto, UpdateCartItemDto } from '@arkan-gold/shared';

interface AuthenticatedRequest extends Request {
  user: { userId: string; phone: string; sessionId: string };
}

@ApiTags('Cart')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, ActiveUserGuard)
@Controller('cart')
export class CartController {
  constructor(private readonly service: CartService) {}

  @Get()
  @ApiOperation({ summary: 'دریافت سبد خرید' })
  getCart(@Req() req: AuthenticatedRequest) {
    return this.service.getCart(req.user.userId);
  }

  @Post('items')
  @ApiOperation({ summary: 'افزودن آیتم به سبد' })
  addItem(@Req() req: AuthenticatedRequest, @Body() dto: AddCartItemDto) {
    return this.service.addItem(req.user.userId, dto);
  }

  @Patch('items/:itemId')
  @ApiOperation({ summary: 'تغییر تعداد آیتم' })
  updateItem(
    @Req() req: AuthenticatedRequest,
    @Param('itemId') itemId: string,
    @Body() dto: UpdateCartItemDto,
  ) {
    return this.service.updateItem(req.user.userId, itemId, dto);
  }

  @Delete('items/:itemId')
  @ApiOperation({ summary: 'حذف آیتم از سبد' })
  removeItem(
    @Req() req: AuthenticatedRequest,
    @Param('itemId') itemId: string,
  ) {
    return this.service.removeItem(req.user.userId, itemId);
  }

  @Delete()
  @ApiOperation({ summary: 'خالی کردن سبد' })
  clear(@Req() req: AuthenticatedRequest) {
    return this.service.clear(req.user.userId);
  }
}
