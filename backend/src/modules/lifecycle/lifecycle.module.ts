import { Injectable, Module, OnModuleInit } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AuthService } from '../auth/auth.service';

@Injectable()
class LifecycleService implements OnModuleInit {
  constructor(private readonly auth: AuthService) {}

  async onModuleInit() {
    await this.auth.ensureSeedAdmin();
  }
}

@Module({
  imports: [AuthModule],
  providers: [LifecycleService],
})
export class LifecycleModule {}

