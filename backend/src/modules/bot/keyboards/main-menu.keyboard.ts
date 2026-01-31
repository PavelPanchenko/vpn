import type { ConfigService } from '@nestjs/config';
import type { PrismaService } from '../../prisma/prisma.service';
import type { TelegramReplyOptions } from '../telegram-runtime.types';

export async function buildMainMenuKeyboard(args: {
  prisma: PrismaService;
  config: ConfigService;
  user:
    | {
        id?: string;
        serverId?: string | null;
        userServers?: unknown[];
      }
    | null;
}): Promise<TelegramReplyOptions> {
  const { getMarkup } = await import('../telegram-markup.utils');
  const Markup = await getMarkup();

  // Перезагружаем пользователя, чтобы меню не "ломалось" на неподтвержденном выборе локации
  const hydratedUser = args.user?.id
    ? await args.prisma.vpnUser.findUnique({
        where: { id: args.user.id },
        include: {
          userServers: { where: { isActive: true } },
        },
      })
    : args.user;

  const hasActiveLocation = Boolean(
    hydratedUser?.serverId || (hydratedUser?.userServers && hydratedUser.userServers.length > 0),
  );

  const row1: unknown[] = [];
  const row2: unknown[] = [];

  if (hasActiveLocation) {
    row1.push(Markup.button.callback('📥 Получить конфиг', 'get_config'));
    row1.push(Markup.button.callback('📊 Статус подписки', 'show_status'));

    row2.push(Markup.button.callback('📍 Выбрать другую локацию', 'back_to_servers'));
    row2.push(Markup.button.callback('💳 Оплатить подписку', 'show_pay'));
  } else {
    row1.push(Markup.button.callback('📍 Выбрать локацию', 'back_to_servers'));
    row1.push(Markup.button.callback('💳 Оплатить подписку', 'show_pay'));
  }

  return Markup.inlineKeyboard(row2.length > 0 ? [row1, row2] : [row1]);
}

