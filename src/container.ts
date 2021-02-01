import "reflect-metadata";
import { Container } from "inversify";
import SERVICE_IDENTIFIER from "./constants/identifiers";
import AppService from "./entities/app";
import App from "./interfaces/app.interface";
import MessagingService from "./entities/messaging";
import Messaging from "./interfaces/messaging.interface";
import Authentication from "./interfaces/authentication.interface";
import AuthenticationService from "./entities/authentication";

let container = new Container();

container.bind<App>(SERVICE_IDENTIFIER.APP).to(AppService);
container.bind<Messaging>(SERVICE_IDENTIFIER.MESSAGING).to(MessagingService);
container
    .bind<Authentication>(SERVICE_IDENTIFIER.AUTHENTICATION)
    .to(AuthenticationService);

export default container;
