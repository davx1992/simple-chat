import "reflect-metadata";
import { Container } from "inversify";
import SERVICE_IDENTIFIER from "./constants/identifiers";
import App from "./entities/app";
import AppInterface from "./interfaces/app.interface";

let container = new Container();

container.bind<AppInterface>(SERVICE_IDENTIFIER.APP).to(App);

export default container;
