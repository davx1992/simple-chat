import { Contains, IsNumber, IsString, ValidateNested } from "class-validator";

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
    @Contains("@")
    @IsString()
    to: string;
    @IsNumber()
    timestamp: number;
    @ValidateNested()
    body: MessageBody;
}

export interface MessageEvent {
    id?: string;
    message_id: string;
    to: string;
    timestamp: number;
    created: string;
}

export interface Acknowledgment {
    messageId: string;
}

export interface Chat {
    id?: string;
    timestamp: number;
    created: string;
    users?: string[];
}
