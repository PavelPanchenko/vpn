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
exports.ServersController = void 0;
const common_1 = require("@nestjs/common");
const admin_auth_decorator_1 = require("../../common/guards/admin-auth.decorator");
const id_param_dto_1 = require("../../common/dto/id-param.dto");
const create_server_dto_1 = require("./dto/create-server.dto");
const update_server_dto_1 = require("./dto/update-server.dto");
const panel_auth_dto_1 = require("./dto/panel-auth.dto");
const servers_service_1 = require("./servers.service");
let ServersController = class ServersController {
    servers;
    constructor(servers) {
        this.servers = servers;
    }
    testPanel(dto) {
        return this.servers.testPanel(dto);
    }
    listPanelInbounds(dto) {
        return this.servers.listPanelInbounds(dto);
    }
    createFromPanel(dto) {
        return this.servers.createFromPanel(dto);
    }
    list() {
        return this.servers.list();
    }
    get(params) {
        return this.servers.get(params.id);
    }
    create(dto) {
        return this.servers.create(dto);
    }
    update(params, dto) {
        return this.servers.update(params.id, dto);
    }
    remove(params) {
        return this.servers.remove(params.id);
    }
    syncFromPanel(params, dto) {
        return this.servers.syncFromPanel(params.id, dto);
    }
    getConnectedInbound(params) {
        return this.servers.getConnectedInbound(params.id);
    }
};
exports.ServersController = ServersController;
__decorate([
    (0, common_1.Post)('panel/test'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [panel_auth_dto_1.PanelAuthDto]),
    __metadata("design:returntype", void 0)
], ServersController.prototype, "testPanel", null);
__decorate([
    (0, common_1.Post)('panel/inbounds'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [panel_auth_dto_1.PanelAuthDto]),
    __metadata("design:returntype", void 0)
], ServersController.prototype, "listPanelInbounds", null);
__decorate([
    (0, common_1.Post)('from-panel'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [panel_auth_dto_1.CreateServerFromPanelDto]),
    __metadata("design:returntype", void 0)
], ServersController.prototype, "createFromPanel", null);
__decorate([
    (0, common_1.Get)(),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], ServersController.prototype, "list", null);
__decorate([
    (0, common_1.Get)(':id'),
    __param(0, (0, common_1.Param)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [id_param_dto_1.IdParamDto]),
    __metadata("design:returntype", void 0)
], ServersController.prototype, "get", null);
__decorate([
    (0, common_1.Post)(),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [create_server_dto_1.CreateServerDto]),
    __metadata("design:returntype", void 0)
], ServersController.prototype, "create", null);
__decorate([
    (0, common_1.Patch)(':id'),
    __param(0, (0, common_1.Param)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [id_param_dto_1.IdParamDto, update_server_dto_1.UpdateServerDto]),
    __metadata("design:returntype", void 0)
], ServersController.prototype, "update", null);
__decorate([
    (0, common_1.Delete)(':id'),
    __param(0, (0, common_1.Param)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [id_param_dto_1.IdParamDto]),
    __metadata("design:returntype", void 0)
], ServersController.prototype, "remove", null);
__decorate([
    (0, common_1.Post)(':id/panel/sync'),
    __param(0, (0, common_1.Param)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [id_param_dto_1.IdParamDto, panel_auth_dto_1.SyncServerFromPanelDto]),
    __metadata("design:returntype", void 0)
], ServersController.prototype, "syncFromPanel", null);
__decorate([
    (0, common_1.Get)(':id/panel/inbound'),
    __param(0, (0, common_1.Param)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [id_param_dto_1.IdParamDto]),
    __metadata("design:returntype", void 0)
], ServersController.prototype, "getConnectedInbound", null);
exports.ServersController = ServersController = __decorate([
    (0, common_1.Controller)('servers'),
    (0, admin_auth_decorator_1.AdminAuth)(),
    __metadata("design:paramtypes", [servers_service_1.ServersService])
], ServersController);
//# sourceMappingURL=servers.controller.js.map