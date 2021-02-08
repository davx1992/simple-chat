import { Connection } from "rethinkdb-ts";
import { Server } from "socket.io";

export default interface App {
    init(config: AppConfig): void;
    initiateDatabase(host: string, port: number, db: string): void;
}

export interface AppConfig {
    port: number;
    extAuthenticationUrl: string;
    db_host: string;
    db_port: number;
    db_name: string;
}
