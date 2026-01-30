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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.UsersController = void 0;
const common_1 = require("@nestjs/common");
const admin_auth_decorator_1 = require("../../common/guards/admin-auth.decorator");
const id_param_dto_1 = require("../../common/dto/id-param.dto");
const create_user_dto_1 = require("./dto/create-user.dto");
const update_user_dto_1 = require("./dto/update-user.dto");
const add_server_dto_1 = require("./dto/add-server.dto");
const users_service_1 = require("./users.service");
let UsersController = class UsersController {
    users;
    constructor(users) {
        this.users = users;
    }
    list() {
        return this.users.list();
    }
    get(params) {
        return this.users.get(params.id);
    }
    create(dto) {
        return this.users.create(dto);
    }
    update(params, dto) {
        return this.users.update(params.id, dto);
    }
    remove(params) {
        return this.users.remove(params.id);
    }
    getConfig(params) {
        return this.users.getConfig(params.id);
    }
    addServer(params, dto) {
        return this.users.addServer(params.id, dto.serverId);
    }
    removeServer(params, serverId) {
        return this.users.removeServer(params.id, serverId);
    }
    activateServer(params, serverId) {
        return this.users.activateServer(params.id, serverId);
    }
};
exports.UsersController = UsersController;
__decorate([
    (0, common_1.Get)(),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], UsersController.prototype, "list", null);
__decorate([
    (0, common_1.Get)(':id'),
    __param(0, (0, common_1.Param)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [id_param_dto_1.IdParamDto]),
    __metadata("design:returntype", void 0)
], UsersController.prototype, "get", null);
__decorate([
    (0, common_1.Post)(),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [create_user_dto_1.CreateUserDto]),
    __metadata("design:returntype", void 0)
], UsersController.prototype, "create", null);
__decorate([
    (0, common_1.Patch)(':id'),
    __param(0, (0, common_1.Param)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [id_param_dto_1.IdParamDto, update_user_dto_1.UpdateUserDto]),
    __metadata("design:returntype", void 0)
], UsersController.prototype, "update", null);
__decorate([
    (0, common_1.Delete)(':id'),
    __param(0, (0, common_1.Param)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [id_param_dto_1.IdParamDto]),
    __metadata("design:returntype", void 0)
], UsersController.prototype, "remove", null);
__decorate([
    (0, common_1.Get)(':id/config'),
    __param(0, (0, common_1.Param)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [id_param_dto_1.IdParamDto]),
    __metadata("design:returntype", void 0)
], UsersController.prototype, "getConfig", null);
__decorate([
    (0, common_1.Post)(':id/servers'),
    __param(0, (0, common_1.Param)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [id_param_dto_1.IdParamDto, add_server_dto_1.AddServerDto]),
    __metadata("design:returntype", void 0)
], UsersController.prototype, "addServer", null);
__decorate([
    (0, common_1.Delete)(':id/servers/:serverId'),
    __param(0, (0, common_1.Param)()),
    __param(1, (0, common_1.Param)('serverId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [id_param_dto_1.IdParamDto, String]),
    __metadata("design:returntype", void 0)
], UsersController.prototype, "removeServer", null);
__decorate([
    (0, common_1.Post)(':id/servers/:serverId/activate'),
    __param(0, (0, common_1.Param)()),
    __param(1, (0, common_1.Param)('serverId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [id_param_dto_1.IdParamDto, String]),
    __metadata("design:returntype", void 0)
], UsersController.prototype, "activateServer", null);
exports.UsersController = UsersController = __decorate([
    (0, common_1.Controller)('users'),
    (0, admin_auth_decorator_1.AdminAuth)(),
    __metadata("design:paramtypes", [users_service_1.UsersService])
], UsersController);
//# sourceMappingURL=users.controller.js.map