import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { SchedulerService } from './scheduler.service';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [
    // Планировщик задач NestJS
    ScheduleModule.forRoot(),
    UsersModule,
  ],
  providers: [SchedulerService],
})
export class SchedulerModule {}

