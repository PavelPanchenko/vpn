import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Max, Min, MinLength } from 'class-validator';

export class CreateServerDto {
  @IsString()
  @MinLength(2)
  name!: string;

  @IsString()
  host!: string;

  @IsInt()
  @Min(1)
  @Max(65535)
  port!: number;

  @IsIn(['WS', 'TCP'])
  transport!: 'WS' | 'TCP';

  @IsBoolean()
  tls!: boolean;

  @IsOptional()
  @IsIn(['NONE', 'TLS', 'REALITY'])
  security?: 'NONE' | 'TLS' | 'REALITY';

  @IsOptional()
  @IsString()
  path?: string;

  @IsOptional()
  @IsString()
  sni?: string;

  @IsString()
  publicKey!: string;

  @IsString()
  shortId!: string;

  @IsInt()
  @Min(0)
  maxUsers!: number;

  @IsBoolean()
  active!: boolean;
}

