import { Injectable, Logger, NotFoundException, BadRequestException, Inject, forwardRef } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSupportMessageDto } from './dto/create-support-message.dto';
import { UpdateSupportMessageDto } from './dto/update-support-message.dto';
import { ReplySupportMessageDto } from './dto/reply-support-message.dto';
import { SupportMessageType, SupportTicketStatus } from '@prisma/client';
import { TelegramBotService } from '../bot/telegram-bot.service';

@Injectable()
export class SupportService {
  private readonly logger = new Logger(SupportService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => TelegramBotService))
    private readonly telegramBotService: TelegramBotService,
  ) {}

  async findAll(filters?: {
    status?: SupportTicketStatus;
    vpnUserId?: string;
  }) {
    const where: any = {};

    if (filters?.status) {
      where.status = filters.status;
    }

    if (filters?.vpnUserId) {
      where.vpnUserId = filters.vpnUserId;
    }

    return this.prisma.supportMessage.findMany({
      where,
      include: {
        vpnUser: {
          select: {
            id: true,
            name: true,
            telegramId: true,
            status: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  async findOne(id: string) {
    const message = await this.prisma.supportMessage.findUnique({
      where: { id },
      include: {
        vpnUser: {
          select: {
            id: true,
            name: true,
            telegramId: true,
            status: true,
          },
        },
      },
    });

    if (!message) {
      throw new NotFoundException(`Support message with ID ${id} not found`);
    }

    return message;
  }

  async findByUserId(vpnUserId: string) {
    return this.prisma.supportMessage.findMany({
      where: { vpnUserId },
      include: {
        vpnUser: {
          select: {
            id: true,
            name: true,
            telegramId: true,
            status: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  async create(dto: CreateSupportMessageDto) {
    // Проверяем существование пользователя
    const user = await this.prisma.vpnUser.findUnique({
      where: { id: dto.vpnUserId },
    });

    if (!user) {
      throw new NotFoundException(`User with ID ${dto.vpnUserId} not found`);
    }

    // Если это сообщение от пользователя, открываем тикет (если еще не открыт)
    // Если это ответ админа, оставляем статус как есть
    const status = dto.status || (dto.type === SupportMessageType.USER_MESSAGE ? SupportTicketStatus.OPEN : SupportTicketStatus.OPEN);

    return this.prisma.supportMessage.create({
      data: {
        vpnUserId: dto.vpnUserId,
        type: dto.type,
        message: dto.message,
        status,
      },
      include: {
        vpnUser: {
          select: {
            id: true,
            name: true,
            telegramId: true,
            status: true,
          },
        },
      },
    });
  }

  async reply(messageId: string, dto: ReplySupportMessageDto) {
    const originalMessage = await this.findOne(messageId);

    if (originalMessage.type !== SupportMessageType.USER_MESSAGE) {
      throw new BadRequestException('Can only reply to user messages');
    }

    // Получаем пользователя для отправки ответа
    const user = await this.prisma.vpnUser.findUnique({
      where: { id: originalMessage.vpnUserId },
      select: { id: true, telegramId: true },
    });

    // Создаем ответ от админа
    const reply = await this.create({
      vpnUserId: originalMessage.vpnUserId,
      type: SupportMessageType.ADMIN_REPLY,
      message: dto.message,
      status: SupportTicketStatus.OPEN, // Оставляем открытым, чтобы пользователь мог ответить
    });

    // Отправляем ответ пользователю через бота
    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (!user.telegramId) {
      this.logger.warn(`User ${user.id} does not have telegramId, cannot send support reply via Telegram`);
    } else {
      try {
        await this.telegramBotService.sendSupportReply(user.telegramId, dto.message);
      } catch (error: any) {
        this.logger.error('Failed to send support reply via Telegram:', error);
      }
    }

    return reply;
  }

  async update(id: string, dto: UpdateSupportMessageDto) {
    await this.findOne(id); // Проверяем существование

    return this.prisma.supportMessage.update({
      where: { id },
      data: dto,
      include: {
        vpnUser: {
          select: {
            id: true,
            name: true,
            telegramId: true,
            status: true,
          },
        },
      },
    });
  }

  async closeTicket(vpnUserId: string) {
    // Закрываем все открытые сообщения пользователя
    return this.prisma.supportMessage.updateMany({
      where: {
        vpnUserId,
        status: SupportTicketStatus.OPEN,
      },
      data: {
        status: SupportTicketStatus.CLOSED,
      },
    });
  }

  async remove(id: string) {
    await this.findOne(id); // Проверяем существование

    return this.prisma.supportMessage.delete({
      where: { id },
    });
  }

  async getOpenTicketsCount() {
    return this.prisma.supportMessage.count({
      where: {
        status: SupportTicketStatus.OPEN,
        type: SupportMessageType.USER_MESSAGE,
      },
    });
  }
}
