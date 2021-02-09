import { AppConfig } from "../interfaces/app.interface";
import express from "express";
import * as http from "http";
import { Server } from "socket.io";
import { inject, injectable } from "inversify";
import { logger } from "../constants/logger";
import SERVICE_IDENTIFIER from "../constants/identifiers";
import { Connection, r } from "rethinkdb-ts";
import MessagingService from "./messaging/messaging";
import AuthenticationService from "./authentication";

//RethinkDB connection instance
export let conn: Connection;

//Socket.Io server instance
export let io: Server;

@injectable()
export default class AppService {
    private _messaging: MessagingService;
    private _authentication: AuthenticationService;

    constructor(
        @inject(SERVICE_IDENTIFIER.MESSAGING) messaging: MessagingService,
        @inject(SERVICE_IDENTIFIER.AUTHENTICATION)
        authentication: AuthenticationService,
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
        return new Promise<void>(async (resolve, reject) => {
            try {
                conn = await r.connect({ host, port, db });
                let existing = await r.tableList().coerceTo("ARRAY").run(conn);

                let tables = [
                    "chat",
                    "chat_user",
                    "messages",
                    "message_event",
                    "users",
                ];

                const tableCreationPromises = tables.map((table) => {
                    if (!existing.includes(table)) {
                        r.tableCreate(table).run(conn);
                        logger.info(`Created table ${table}`);
                    }
                });

                Promise.all(tableCreationPromises).then(() => {
                    resolve();
                });

                logger.info(`Connected to database ${host}:${port}/${db}`);
            } catch (error) {
                logger.error(error);
                reject(error);
            }
        });
    }

    /**
     * Initiate app
     *
     * @param config server config object
     */
    async init(config: AppConfig): Promise<void> {
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

        await this.initiateDatabase(db_host, db_port, db_name);
        io = new Server(server);
        this._messaging.initEvents();
        this._authentication.addMidleware(extAuthenticationUrl);

        server.listen(port, () => {
            logger.info(`Listening on *:${port}`);
        });
    }
}
