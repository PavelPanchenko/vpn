import { Injectable, Module, OnModuleInit } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AuthService } from '../auth/auth.service';
import { PlansModule } from '../plans/plans.module';
import { PlansService } from '../plans/plans.service';
import { seedPlans } from '../plans/plans.seed';

@Injectable()
class LifecycleService implements OnModuleInit {
  constructor(private readonly auth: AuthService, private readonly plans: PlansService) {}

  async onModuleInit() {
    await this.auth.ensureSeedAdmin();
    await seedPlans();
  }
}

@Module({
  imports: [AuthModule, PlansModule],
  providers: [LifecycleService],
})
export class LifecycleModule {}

