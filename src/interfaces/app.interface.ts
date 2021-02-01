import { Server } from "socket.io";
export default interface App {
    _io: Server;
    init(config: AppConfig): void;
}

export interface AppConfig {
    port: number;
    extAuthenticationUrl: string;
}
