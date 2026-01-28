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
exports.LifecycleModule = void 0;
const common_1 = require("@nestjs/common");
const auth_module_1 = require("../auth/auth.module");
const auth_service_1 = require("../auth/auth.service");
const plans_module_1 = require("../plans/plans.module");
const plans_service_1 = require("../plans/plans.service");
const plans_seed_1 = require("../plans/plans.seed");
let LifecycleService = class LifecycleService {
    auth;
    plans;
    constructor(auth, plans) {
        this.auth = auth;
        this.plans = plans;
    }
    async onModuleInit() {
        await this.auth.ensureSeedAdmin();
        await (0, plans_seed_1.seedPlans)();
    }
};
LifecycleService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [auth_service_1.AuthService, plans_service_1.PlansService])
], LifecycleService);
let LifecycleModule = class LifecycleModule {
};
exports.LifecycleModule = LifecycleModule;
exports.LifecycleModule = LifecycleModule = __decorate([
    (0, common_1.Module)({
        imports: [auth_module_1.AuthModule, plans_module_1.PlansModule],
        providers: [LifecycleService],
    })
], LifecycleModule);
//# sourceMappingURL=lifecycle.module.js.map