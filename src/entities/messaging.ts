import Messaging from "../interfaces/messaging.interface";
import { Server, Socket } from "socket.io";
import { logger } from "../constants/logger";
import { injectable } from "inversify";

@injectable()
export default class MessagingService implements Messaging {
    onConnect(socket: Socket): void {
        logger.info("Connected " + socket.id);
    }
    onDisconnect(): void {}
    onMessage(): void {}

    initEvents(io: Server): void {
        io.on("connection", this.onConnect);
        io.on("disconnect", this.onDisconnect);
        io.on("message", this.onMessage);
    }
}
