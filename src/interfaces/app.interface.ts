import { Server } from "socket.io";

export default interface AppInterface {
    _io: Server;
    init(): void;
}
