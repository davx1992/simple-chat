import {
  IsBoolean,
  IsNumber,
  IsString,
  ValidateIf,
  ValidateNested,
} from "class-validator";

export enum ChatTypes {
  SUC = "@suc",
  MUC = "@muc",
}

class MessageBody {
  @IsString()
  text: string;
}

export interface ValidationError {
  field: string;
  error: string;
}

export class Message {
  id?: string;

  @IsString()
  to: string;
  @IsNumber()
  timestamp: number;

  @ValidateIf(
    (o) =>
      typeof o.typing === "undefined" ||
      (typeof o.typing !== "undefined" && typeof o.body !== "undefined")
  )
  @ValidateNested()
  body?: MessageBody;
  @ValidateIf(
    (o) =>
      typeof o.body === "undefined" ||
      (typeof o.typing !== "undefined" && typeof o.body !== "undefined")
  )
  @IsBoolean()
  typing?: boolean;
  //Is used when sending to receipient
  from?: string;
}

export interface MessageEvent {
  id?: string;
  message_id: string;
  to: string;
  timestamp: number;
  created: string;
}

export interface Chat {
  id?: string;
  timestamp: number;
  created: string;
  users?: string[];
  type: ChatTypes;
}

export interface ChatUser {
  chat_id: string;
  timestamp: number;
  created: string;
  user_id: string;
  id: string;
  temp: boolean;
}

export interface Connection {
  created: string;
  id: string;
  timestamp: number;
  user_id: string;
}

export interface ConnectionChatUser extends Connection {
  temp?: boolean;
}
