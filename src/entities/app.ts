import AppInterface from "../interfaces/app.interface";
import express from "express";
import * as http from "http";
import { Server } from "socket.io";
import { injectable } from "inversify";

@injectable()
export default class App implements AppInterface {
    public _io: Server;

    init(): void {
        const app = express();
        const server = http.createServer(app);
        this._io = new Server(server);
        console.log("Init");
    }
}
