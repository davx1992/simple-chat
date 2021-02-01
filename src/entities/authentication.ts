import { injectable } from "inversify";
import { Server, Socket } from "socket.io";
import Authentication from "../interfaces/authentication.interface";
import axios from "axios";
import { logger } from "../constants/logger";

@injectable()
export default class AuthenticationService implements Authentication {
    private _url: string;

    constructor() {
        this.authenticate = this.authenticate.bind(this);
        this.authMiddleware = this.authMiddleware.bind(this);
    }

    addMidleware(io: Server, url: string): void {
        io.use(this.authMiddleware);
        this._url = url;
    }

    async authMiddleware(socket: Socket, next): Promise<void> {
        const token = socket.handshake.auth["token"];
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
    }

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
                    logger.error(err);
                    reject(err);
                });
        });
    }
}
