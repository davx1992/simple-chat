import { inject, injectable } from "inversify";
import { Socket } from "socket.io";
import axios from "axios";
import { logger } from "../constants/logger";
import { io } from "./app";
import { MessagingOperations } from "./messaging/operations";
import SERVICE_IDENTIFIER from "../constants/identifiers";

@injectable()
export default class AuthenticationService {
    private _url: string;

    constructor() {
        this.authenticate = this.authenticate.bind(this);
        this.authMiddleware = this.authMiddleware.bind(this);
    }

    /**
     * Add middleware to Socket.IO
     *
     * @param io Server instance
     * @param url url of external authentication server
     */
    addMidleware(url: string): void {
        io.use(this.authMiddleware);
        this._url = url;
    }

    /**
     * Middleware which you can pass to Socket.IO
     *
     * @param socket connection socket instance
     * @param next next function which you can call
     */
    async authMiddleware(socket: Socket, next): Promise<void> {
        const token = socket.handshake.auth["token"];
        const userId = socket.handshake.auth["userId"];

        if (token && userId) {
            try {
                const verified = await this.authenticate(token);
                if (verified) {
                    logger.info("Authenticated.");
                    next();
                } else {
                    next(new Error("Unauthorized."));
                }
            } catch (err) {
                next(new Error("Error during authentication."));
            }
        } else {
            next(new Error("Not all details provided."));
        }
    }

    /**
     * Authenticate in external server
     *
     * @param token authentication token
     */
    authenticate(token: string) {
        return new Promise<boolean>((resolve, reject) => {
            axios
                .post<{ verified: boolean }>(this._url, {
                    token,
                })
                .then((response) => {
                    const { verified } = response.data;
                    if (verified) {
                        resolve(true);
                    } else {
                        resolve(false);
                    }
                })
                .catch((err) => {
                    logger.error("Error during authentication " + err);
                    reject(err);
                });
        });
    }
}
