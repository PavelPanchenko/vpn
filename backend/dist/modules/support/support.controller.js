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
exports.SupportController = void 0;
const common_1 = require("@nestjs/common");
const support_service_1 = require("./support.service");
const create_support_message_dto_1 = require("./dto/create-support-message.dto");
const update_support_message_dto_1 = require("./dto/update-support-message.dto");
const reply_support_message_dto_1 = require("./dto/reply-support-message.dto");
const jwt_auth_guard_1 = require("../auth/jwt-auth.guard");
const client_1 = require("@prisma/client");
let SupportController = class SupportController {
    supportService;
    constructor(supportService) {
        this.supportService = supportService;
    }
    findAll(status, vpnUserId) {
        return this.supportService.findAll({ status, vpnUserId });
    }
    async getStats() {
        const openTickets = await this.supportService.getOpenTicketsCount();
        return { openTickets };
    }
    findByUserId(vpnUserId) {
        return this.supportService.findByUserId(vpnUserId);
    }
    findOne(id) {
        return this.supportService.findOne(id);
    }
    create(createSupportMessageDto) {
        return this.supportService.create(createSupportMessageDto);
    }
    reply(id, replyDto) {
        return this.supportService.reply(id, replyDto);
    }
    update(id, updateSupportMessageDto) {
        return this.supportService.update(id, updateSupportMessageDto);
    }
    closeTicket(vpnUserId) {
        return this.supportService.closeTicket(vpnUserId);
    }
    remove(id) {
        return this.supportService.remove(id);
    }
};
exports.SupportController = SupportController;
__decorate([
    (0, common_1.Get)(),
    __param(0, (0, common_1.Query)('status')),
    __param(1, (0, common_1.Query)('vpnUserId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", void 0)
], SupportController.prototype, "findAll", null);
__decorate([
    (0, common_1.Get)('stats'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], SupportController.prototype, "getStats", null);
__decorate([
    (0, common_1.Get)('user/:vpnUserId'),
    __param(0, (0, common_1.Param)('vpnUserId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], SupportController.prototype, "findByUserId", null);
__decorate([
    (0, common_1.Get)(':id'),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], SupportController.prototype, "findOne", null);
__decorate([
    (0, common_1.Post)(),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [create_support_message_dto_1.CreateSupportMessageDto]),
    __metadata("design:returntype", void 0)
], SupportController.prototype, "create", null);
__decorate([
    (0, common_1.Post)(':id/reply'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, reply_support_message_dto_1.ReplySupportMessageDto]),
    __metadata("design:returntype", void 0)
], SupportController.prototype, "reply", null);
__decorate([
    (0, common_1.Patch)(':id'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, update_support_message_dto_1.UpdateSupportMessageDto]),
    __metadata("design:returntype", void 0)
], SupportController.prototype, "update", null);
__decorate([
    (0, common_1.Patch)('user/:vpnUserId/close'),
    __param(0, (0, common_1.Param)('vpnUserId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], SupportController.prototype, "closeTicket", null);
__decorate([
    (0, common_1.Delete)(':id'),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], SupportController.prototype, "remove", null);
exports.SupportController = SupportController = __decorate([
    (0, common_1.Controller)('support'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __metadata("design:paramtypes", [support_service_1.SupportService])
], SupportController);
//# sourceMappingURL=support.controller.js.map