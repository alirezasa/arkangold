// api/src/market/price.gateway.ts
//
// به‌جای اینکه PriceService مستقیماً Gateway را inject کند (که باعث
// circular dependency و نیاز به forwardRef می‌شد)، Gateway به event
// گوش می‌دهد. این یک الگوی استاندارد و تمیز در NestJS است.

import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PRICE_UPDATED_EVENT, CachedPricePayload } from './price.service';

@WebSocketGateway({
  cors: {
    origin: process.env.CORS_ORIGINS?.split(',') ?? [
      'http://localhost:3000',
      'http://localhost:3001',
    ],
  },
  namespace: 'market',
})
export class PriceGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(PriceGateway.name);
  private connectedClients = 0;

  handleConnection(client: Socket) {
    this.connectedClients++;
    this.logger.debug(
      `Client متصل شد: ${client.id} (مجموع: ${this.connectedClients})`,
    );
  }

  handleDisconnect(client: Socket) {
    this.connectedClients--;
    this.logger.debug(
      `Client قطع شد: ${client.id} (مجموع: ${this.connectedClients})`,
    );
  }

  // ── این متد به‌صورت خودکار با هر بار emit شدن event در PriceService صدا زده می‌شود ──
  @OnEvent(PRICE_UPDATED_EVENT)
  handlePriceUpdated(payload: CachedPricePayload) {
    // فقط در صورتی broadcast کن که حداقل یک client متصل باشد (بهینه‌سازی جزئی)
    if (this.connectedClients === 0) return;
    this.server.emit('price_updated', payload);
  }
}
