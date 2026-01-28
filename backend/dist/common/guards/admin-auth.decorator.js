"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AdminAuth = AdminAuth;
const common_1 = require("@nestjs/common");
const jwt_auth_guard_1 = require("../../modules/auth/jwt-auth.guard");
const admin_only_guard_1 = require("./admin-only.guard");
function AdminAuth() {
    return (0, common_1.applyDecorators)((0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, admin_only_guard_1.AdminOnlyGuard));
}
//# sourceMappingURL=admin-auth.decorator.js.map