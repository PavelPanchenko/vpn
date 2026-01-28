"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthService = void 0;
const common_1 = require("@nestjs/common");
const jwt_1 = require("@nestjs/jwt");
const config_1 = require("@nestjs/config");
const bcrypt = require("bcrypt");
const prisma_service_1 = require("../prisma/prisma.service");
let AuthService = class AuthService {
    prisma;
    jwt;
    config;
    constructor(prisma, jwt, config) {
        this.prisma = prisma;
        this.jwt = jwt;
        this.config = config;
    }
    async validateAdmin(email, password) {
        const admin = await this.prisma.adminUser.findUnique({ where: { email } });
        if (!admin)
            throw new common_1.UnauthorizedException('Invalid credentials');
        const ok = await bcrypt.compare(password, admin.passwordHash);
        if (!ok)
            throw new common_1.UnauthorizedException('Invalid credentials');
        return admin;
    }
    async login(email, password) {
        const admin = await this.validateAdmin(email, password);
        const payload = { sub: admin.id, email: admin.email, role: 'ADMIN' };
        const accessToken = await this.jwt.signAsync(payload);
        return { accessToken };
    }
    async ensureSeedAdmin() {
        const email = this.config.get('ADMIN_SEED_EMAIL');
        const password = this.config.get('ADMIN_SEED_PASSWORD');
        if (!email || !password)
            return;
        const existing = await this.prisma.adminUser.findUnique({ where: { email } });
        if (existing)
            return;
        const saltRounds = 10;
        const passwordHash = await bcrypt.hash(password, saltRounds);
        await this.prisma.adminUser.create({
            data: { email, passwordHash, role: 'ADMIN' },
        });
    }
};
exports.AuthService = AuthService;
exports.AuthService = AuthService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        jwt_1.JwtService,
        config_1.ConfigService])
], AuthService);
//# sourceMappingURL=auth.service.js.map