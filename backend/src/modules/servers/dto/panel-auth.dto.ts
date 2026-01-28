import { IsInt, IsOptional, IsString, Min } from 'class-validator';

export class PanelAuthDto {
  @IsString()
  panelBaseUrl!: string;

  @IsString()
  panelUsername!: string;

  @IsString()
  panelPassword!: string;
}

export class PanelInboundsDto extends PanelAuthDto {}

export class CreateServerFromPanelDto extends PanelAuthDto {
  @IsString()
  name!: string;

  @IsInt()
  @Min(1)
  inboundId!: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  maxUsers?: number;

  @IsOptional()
  active?: boolean;
}

export class SyncServerFromPanelDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  inboundId?: number;
}

