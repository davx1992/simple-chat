import { Server, Socket } from "socket.io";

export default interface Authentication {
    authenticate(token: string): void;
    addMidleware(url: string): void;
    authMiddleware(socket: Socket, next: any): void;
}
