import { AppConfig } from "../interfaces/app.interface";
import * as http from "http";
import { Server } from "socket.io";
import { inject, injectable } from "inversify";
import { logger } from "../constants/logger";
import SERVICE_IDENTIFIER from "../constants/identifiers";
import { Connection, r } from "rethinkdb-ts";
import MessagingService from "./messaging/messaging";
import AuthenticationService from "./authentication";
import { InversifyExpressServer, getRouteInfo } from "inversify-express-utils";
import container from "../container";
import * as bodyParser from "body-parser";
import * as prettyjson from "prettyjson";

//Import controllers
import "../controllers/api.controller";

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
    authentication: AuthenticationService
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
    db: string
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
          "connections",
        ];

        const indexes = {
          connections: ["user_id"],
          messages: ["timestamp", "to", ["to", "timestamp"]],
          chat_user: ["chat_id"],
          message_event: [
            ["to", "message_id"],
            ["to", "message_id", "timestamp"],
          ],
        };

        const tableCreationPromises = tables.map(async (table) => {
          if (!existing.includes(table)) {
            await r.tableCreate(table).run(conn);

            indexes[table]?.map(async (index) => {
              //If is array then it is compound index
              if (Array.isArray(index)) {
                await r
                  .table(table)
                  .indexCreate(index.join("_"), [
                    r.row(index[0]),
                    r.row(index[1]),
                  ])
                  .run(conn);
                console.log(index[0] + "_" + index[1]);
              } else {
                await r.table(table).indexCreate(index).run(conn);
              }

              logger.info(`Index ${index} created on table ${table}`);
            });
            logger.info(`Created table ${table}`);
          }
        });

        await Promise.all(tableCreationPromises);

        // let i;
        // for (i = 0; i < 10000; i++) {
        //   const insert = async () => {
        //     r.table("chat_user")
        //       .insert({
        //         chat_id: "e4932392-ad20-401f-b931-0a91b1a005111",
        //         temp: false,
        //         timestamp: 1613655097286,
        //         user_id: "53fe2eb1-3610-44d7-8eeb-6dabf6e2cbd5",
        //       })
        //       .run(conn);
        //   };
        //   insert();
        // }

        //Clear all open connections as on restart all connections are closed, and client will reconnect
        await r.table("connections").delete().run(conn);
        logger.info(`Connections cleared`);
        logger.info(`Connected to database ${host}:${port}/${db}`);
        resolve();
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

    const { port, extAuthenticationUrl, db_port, db_host, db_name } = config;

    const inversifyExpressServer = new InversifyExpressServer(container);
    inversifyExpressServer.setConfig((app) => {
      // add body parser
      app.use(
        bodyParser.urlencoded({
          extended: true,
        })
      );
      app.use(bodyParser.json());
    });

    let app = inversifyExpressServer.build();
    const server = http.createServer(app);
    await this.initiateDatabase(db_host, db_port, db_name);
    io = new Server(server);

    this._messaging.initEvents();
    this._authentication.addMidleware(extAuthenticationUrl);

    const routeInfo = getRouteInfo(container);

    logger.info(prettyjson.render({ routes: routeInfo }));
    server.listen(port, () => {
      logger.info(`Listening on *:${port}`);
    });
  }
}
