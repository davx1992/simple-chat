import AppInterface, { AppConfig } from "../interfaces/app.interface";
import express from "express";
import * as http from "http";
import { Server } from "socket.io";
import { inject, injectable } from "inversify";
import { logger } from "../constants/logger";
import Messaging from "../interfaces/messaging.interface";
import SERVICE_IDENTIFIER from "../constants/identifiers";
import Authentication from "../interfaces/authentication.interface";
import { Connection, r } from "rethinkdb-ts";

@injectable()
export default class AppService implements AppInterface {
    public _io: Server;
    private _messaging: Messaging;
    private _authentication: Authentication;
    public _conn: Connection;

    constructor(
        @inject(SERVICE_IDENTIFIER.MESSAGING) messaging: Messaging,
        @inject(SERVICE_IDENTIFIER.AUTHENTICATION)
        authentication: Authentication,
    ) {
        this._messaging = messaging;
        this._authentication = authentication;
    }

    /**
     * Connect to RethinkDb and create needed tables
     *
     * @param host host name of database
     * @param port port of database
     * @param db database name
     */
    async initiateDatabase(
        host: string,
        port: number,
        db: string,
    ): Promise<void> {
        try {
            this._conn = await r.connect({ host, port, db });
            let existing = await r
                .tableList()
                .coerceTo("ARRAY")
                .run(this._conn);

            let tables = [
                "chat",
                "chat_user",
                "messages",
                "offline_message",
                "users",
            ];
            tables.map((table) => {
                if (!existing.includes(table)) {
                    r.tableCreate(table).run(this._conn);
                    logger.info(`Created table ${table}`);
                }
            });

            logger.info(`Connected to database ${host}:${port}/${db}`);
        } catch (error) {
            logger.error(error);
        }
    }

    /**
     * Initiate app
     *
     * @param config server config object
     */
    init(config: AppConfig): void {
        logger.info("Starting Simple Chat server");

        const {
            port,
            extAuthenticationUrl,
            db_port,
            db_host,
            db_name,
        } = config;
        const app = express();
        const server = http.createServer(app);

        this.initiateDatabase(db_host, db_port, db_name);
        this._io = new Server(server);
        this._messaging.initEvents(this._io);
        this._authentication.addMidleware(this._io, extAuthenticationUrl);

        server.listen(port, () => {
            logger.info(`Listening on *:${port}`);
        });
    }
}
