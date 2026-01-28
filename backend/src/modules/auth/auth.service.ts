import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { JwtPayload } from './types/jwt-payload';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async validateAdmin(email: string, password: string) {
    const admin = await this.prisma.adminUser.findUnique({ where: { email } });
    if (!admin) throw new UnauthorizedException('Invalid credentials');
    const ok = await bcrypt.compare(password, admin.passwordHash);
    if (!ok) throw new UnauthorizedException('Invalid credentials');
    return admin;
  }

  async login(email: string, password: string) {
    const admin = await this.validateAdmin(email, password);
    const payload: JwtPayload = { sub: admin.id, email: admin.email, role: 'ADMIN' };
    const accessToken = await this.jwt.signAsync(payload);
    return { accessToken };
  }

  /**
   * Простое сидирование admin'а для MVP.
   * В production это обычно делается миграцией/скриптом/CI.
   */
  async ensureSeedAdmin() {
    const email = this.config.get<string>('ADMIN_SEED_EMAIL');
    const password = this.config.get<string>('ADMIN_SEED_PASSWORD');
    if (!email || !password) return;

    const existing = await this.prisma.adminUser.findUnique({ where: { email } });
    if (existing) return;

    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(password, saltRounds);
    await this.prisma.adminUser.create({
      data: { email, passwordHash, role: 'ADMIN' },
    });
  }
}

