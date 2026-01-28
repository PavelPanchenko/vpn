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
exports.SyncServerFromPanelDto = exports.CreateServerFromPanelDto = exports.PanelInboundsDto = exports.PanelAuthDto = void 0;
const class_validator_1 = require("class-validator");
class PanelAuthDto {
    panelBaseUrl;
    panelUsername;
    panelPassword;
}
exports.PanelAuthDto = PanelAuthDto;
__decorate([
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], PanelAuthDto.prototype, "panelBaseUrl", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], PanelAuthDto.prototype, "panelUsername", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], PanelAuthDto.prototype, "panelPassword", void 0);
class PanelInboundsDto extends PanelAuthDto {
}
exports.PanelInboundsDto = PanelInboundsDto;
class CreateServerFromPanelDto extends PanelAuthDto {
    name;
    inboundId;
    maxUsers;
    active;
}
exports.CreateServerFromPanelDto = CreateServerFromPanelDto;
__decorate([
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], CreateServerFromPanelDto.prototype, "name", void 0);
__decorate([
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(1),
    __metadata("design:type", Number)
], CreateServerFromPanelDto.prototype, "inboundId", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(0),
    __metadata("design:type", Number)
], CreateServerFromPanelDto.prototype, "maxUsers", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Boolean)
], CreateServerFromPanelDto.prototype, "active", void 0);
class SyncServerFromPanelDto {
    inboundId;
}
exports.SyncServerFromPanelDto = SyncServerFromPanelDto;
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(1),
    __metadata("design:type", Number)
], SyncServerFromPanelDto.prototype, "inboundId", void 0);
//# sourceMappingURL=panel-auth.dto.js.map