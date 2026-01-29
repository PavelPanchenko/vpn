"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MiniModule = void 0;
const common_1 = require("@nestjs/common");
const mini_controller_1 = require("./mini.controller");
const prisma_module_1 = require("../prisma/prisma.module");
const users_module_1 = require("../users/users.module");
const plans_module_1 = require("../plans/plans.module");
const payments_module_1 = require("../payments/payments.module");
const servers_module_1 = require("../servers/servers.module");
const bot_module_1 = require("../bot/bot.module");
let MiniModule = class MiniModule {
};
exports.MiniModule = MiniModule;
exports.MiniModule = MiniModule = __decorate([
    (0, common_1.Module)({
        imports: [
            prisma_module_1.PrismaModule,
            users_module_1.UsersModule,
            plans_module_1.PlansModule,
            payments_module_1.PaymentsModule,
            servers_module_1.ServersModule,
            (0, common_1.forwardRef)(() => bot_module_1.BotModule),
        ],
        controllers: [mini_controller_1.MiniController],
    })
], MiniModule);
//# sourceMappingURL=mini.module.js.map