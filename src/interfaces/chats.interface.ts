import {
  IsArray,
  IsEnum,
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
