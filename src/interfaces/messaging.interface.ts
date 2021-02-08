import { Socket } from "socket.io";
import { Contains, IsNumber, IsString, ValidateNested } from "class-validator";

export enum UserState {
    ACTIVE = "Active",
    INACTIVE = "Inactive",
}

export enum ChatTypes {
    SUC = "@suc",
    MUC = "@muc",
}

export default interface Messaging {
    onConnect(socket: Socket): void;
    onDisconnect(socket: Socket): void;
    onMessage(
        socket: Socket,
        message: any,
        callback: (messageId?: string, error?: ValidationError[]) => void,
    ): void;
    onCreateChat(
        socket: Socket,
        callback: (chatId?: string, error?: string) => void,
    ): void;
    onAcknowledgment(socket: Socket, acknowledgment: Acknowledgment): void;
    initEvents(): void;
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

export interface User {
    id: string;
    last_login: string;
    last_login_timestamp: number;
    socketId: string;
    state: UserState;
}
