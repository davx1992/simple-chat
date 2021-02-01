import AppInterface, { AppConfig } from "../interfaces/app.interface";
import express from "express";
import * as http from "http";
import { Server } from "socket.io";
import { inject, injectable } from "inversify";
import { logger } from "../constants/logger";
import Messaging from "../interfaces/messaging.interface";
import SERVICE_IDENTIFIER from "../constants/identifiers";
import Authentication from "../interfaces/authentication.interface";

@injectable()
export default class AppService implements AppInterface {
    public _io: Server;
    private _messaging: Messaging;
    private _authentication: Authentication;

    constructor(
        @inject(SERVICE_IDENTIFIER.MESSAGING) messaging: Messaging,
        @inject(SERVICE_IDENTIFIER.AUTHENTICATION)
        authentication: Authentication,
    ) {
        this._messaging = messaging;
        this._authentication = authentication;
    }

    init(config: AppConfig): void {
        logger.info("Starting Simple Chat server");

        const { port, extAuthenticationUrl } = config;
        const app = express();
        const server = http.createServer(app);

        this._io = new Server(server);
        this._messaging.initEvents(this._io);
        this._authentication.addMidleware(this._io, extAuthenticationUrl);

        server.listen(port, () => {
            logger.info(`Listening on *:${port}`);
        });
    }
}
