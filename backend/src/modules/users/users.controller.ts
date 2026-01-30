import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { AdminAuth } from '../../common/guards/admin-auth.decorator';
import { IdParamDto } from '../../common/dto/id-param.dto';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { AddServerDto } from './dto/add-server.dto';
import { UsersService } from './users.service';

@Controller('users')
@AdminAuth()
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  list() {
    return this.users.list();
  }

  @Get(':id')
  get(@Param() params: IdParamDto) {
    return this.users.get(params.id);
  }

  @Post()
  create(@Body() dto: CreateUserDto) {
    return this.users.create(dto);
  }

  @Patch(':id')
  update(@Param() params: IdParamDto, @Body() dto: UpdateUserDto) {
    return this.users.update(params.id, dto);
  }

  @Delete(':id')
  remove(@Param() params: IdParamDto) {
    return this.users.remove(params.id);
  }

  @Get(':id/config')
  getConfig(@Param() params: IdParamDto) {
    return this.users.getConfig(params.id);
  }

  @Post(':id/servers')
  addServer(@Param() params: IdParamDto, @Body() dto: AddServerDto) {
    return this.users.addServer(params.id, dto.serverId);
  }

  @Delete(':id/servers/:serverId')
  removeServer(@Param() params: IdParamDto, @Param('serverId') serverId: string) {
    return this.users.removeServer(params.id, serverId);
  }

  @Post(':id/servers/:serverId/activate')
  activateServer(@Param() params: IdParamDto, @Param('serverId') serverId: string) {
    return this.users.activateServer(params.id, serverId);
  }
}
