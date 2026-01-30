import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { AdminAuth } from '../../common/guards/admin-auth.decorator';
import { IdParamDto } from '../../common/dto/id-param.dto';
import { CreateServerDto } from './dto/create-server.dto';
import { UpdateServerDto } from './dto/update-server.dto';
import { CreateServerFromPanelDto, PanelAuthDto, SyncServerFromPanelDto } from './dto/panel-auth.dto';
import { ServersService } from './servers.service';

@Controller('servers')
@AdminAuth()
export class ServersController {
  constructor(private readonly servers: ServersService) {}

  @Post('panel/test')
  testPanel(@Body() dto: PanelAuthDto) {
    return this.servers.testPanel(dto);
  }

  @Post('panel/inbounds')
  listPanelInbounds(@Body() dto: PanelAuthDto) {
    return this.servers.listPanelInbounds(dto);
  }

  @Post('from-panel')
  createFromPanel(@Body() dto: CreateServerFromPanelDto) {
    return this.servers.createFromPanel(dto);
  }

  @Get()
  list() {
    return this.servers.list();
  }

  @Get(':id')
  get(@Param() params: IdParamDto) {
    return this.servers.get(params.id);
  }

  @Post()
  create(@Body() dto: CreateServerDto) {
    return this.servers.create(dto);
  }

  @Patch(':id')
  update(@Param() params: IdParamDto, @Body() dto: UpdateServerDto) {
    return this.servers.update(params.id, dto);
  }

  @Delete(':id')
  remove(@Param() params: IdParamDto) {
    return this.servers.remove(params.id);
  }

  @Post(':id/panel/sync')
  syncFromPanel(@Param() params: IdParamDto, @Body() dto: SyncServerFromPanelDto) {
    return this.servers.syncFromPanel(params.id, dto);
  }

  @Get(':id/panel/inbound')
  getConnectedInbound(@Param() params: IdParamDto) {
    return this.servers.getConnectedInbound(params.id);
  }
}

