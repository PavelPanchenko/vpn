import { applyDecorators, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../modules/auth/jwt-auth.guard';
import { AdminOnlyGuard } from './admin-only.guard';

export function AdminAuth() {
  return applyDecorators(UseGuards(JwtAuthGuard, AdminOnlyGuard));
}

