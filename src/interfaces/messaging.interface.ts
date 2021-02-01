import { Server, Socket } from "socket.io";

export default interface Messaging {
    onConnect(socket: Socket): void;
    onDisconnect(socket: Socket): void;
    onMessage(socket: Socket): void;
    initEvents(io: Server): void;
}
