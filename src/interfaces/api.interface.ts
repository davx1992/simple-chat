import { Type } from "class-transformer";
import {
  IsArray,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  ValidateIf,
} from "class-validator";
import { ChatTypes } from "./messaging.interface";

export class NewChatDTO {
  @IsString()
  userId: string;
  @IsEnum(ChatTypes)
  type: ChatTypes;
  @ValidateIf((o) => o.type === ChatTypes.SUC)
  @IsArray()
  @IsString({
    each: true,
  })
  users?: string[];
}

export class JoinChatDTO {
  @IsString()
  chatId: string;
  @IsString()
  userId: string;
  @IsOptional()
  temp: boolean;
}

export class LeaveChatDTO {
  @IsString()
  chatId: string;
  @IsString()
  userId: string;
}

export class DeleteChatsDTO {
  @IsArray()
  chatIds: string[];
}

export enum TimeEntity {
  DAYS = "days",
  HOURS = "hours",
  MINUTES = "minutes",
  SECONDS = "seconds",
  WEEKS = "weeks",
  MONTHS = "months",
}

export class LoadInactiveChatListDTO {
  @Type(() => Number)
  @IsNumber()
  old: number;
  @IsEnum(TimeEntity)
  entity: TimeEntity;
}
