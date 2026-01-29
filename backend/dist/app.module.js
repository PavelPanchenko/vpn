"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AppModule = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const auth_module_1 = require("./modules/auth/auth.module");
const prisma_module_1 = require("./modules/prisma/prisma.module");
const servers_module_1 = require("./modules/servers/servers.module");
const users_module_1 = require("./modules/users/users.module");
const subscriptions_module_1 = require("./modules/subscriptions/subscriptions.module");
const payments_module_1 = require("./modules/payments/payments.module");
const lifecycle_module_1 = require("./modules/lifecycle/lifecycle.module");
const scheduler_module_1 = require("./modules/scheduler/scheduler.module");
const plans_module_1 = require("./modules/plans/plans.module");
const dashboard_module_1 = require("./modules/dashboard/dashboard.module");
const bot_module_1 = require("./modules/bot/bot.module");
const support_module_1 = require("./modules/support/support.module");
const mini_module_1 = require("./modules/mini/mini.module");
const public_module_1 = require("./modules/public/public.module");
let AppModule = class AppModule {
};
exports.AppModule = AppModule;
exports.AppModule = AppModule = __decorate([
    (0, common_1.Module)({
        imports: [
            config_1.ConfigModule.forRoot({ isGlobal: true }),
            prisma_module_1.PrismaModule,
            auth_module_1.AuthModule,
            lifecycle_module_1.LifecycleModule,
            servers_module_1.ServersModule,
            users_module_1.UsersModule,
            subscriptions_module_1.SubscriptionsModule,
            payments_module_1.PaymentsModule,
            plans_module_1.PlansModule,
            scheduler_module_1.SchedulerModule,
            dashboard_module_1.DashboardModule,
            bot_module_1.BotModule,
            support_module_1.SupportModule,
            mini_module_1.MiniModule,
            public_module_1.PublicModule,
        ],
    })
], AppModule);
//# sourceMappingURL=app.module.js.map