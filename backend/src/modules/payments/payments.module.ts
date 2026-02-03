import { Module, forwardRef } from '@nestjs/common';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { UsersModule } from '../users/users.module';
import { PaymentIntentsService } from './payment-intents/payment-intents.service';
import { PaymentIntentsController } from './payment-intents/payment-intents.controller';
import { PlategaCallbackController, PlategaController } from './platega/platega.controller';
import { AccessRevokerService } from './access/access-revoker.service';
import { BotModule } from '../bot/bot.module';

@Module({
  imports: [SubscriptionsModule, UsersModule, forwardRef(() => BotModule)],
  controllers: [PaymentsController, PaymentIntentsController, PlategaController, PlategaCallbackController],
  providers: [PaymentsService, PaymentIntentsService, AccessRevokerService],
  exports: [PaymentsService, PaymentIntentsService],
})
export class PaymentsModule {}

