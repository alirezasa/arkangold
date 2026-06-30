// src/market/price.gateway.ts
import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';

@WebSocketGateway({
  cors: { origin: '*' },
  namespace: 'market', // آدرس اتصال فرانت‌اند: ws://localhost:5000/market
})
export class PriceGateway implements OnGatewayConnection {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(PriceGateway.name);

  handleConnection(client: Socket) {
    this.logger.debug(`Client connected to market websocket: ${client.id}`);
  }

  // این متد از داخل PriceService صدا زده می‌شود
  broadcastPrice(priceData: any) {
    this.server.emit('price_updated', priceData);
  }
}
