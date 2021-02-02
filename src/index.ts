import SERVICE_IDENTIFIER from "./constants/identifiers";
import container from "./container";
import AppInterface from "./interfaces/app.interface";

let app = container.get<AppInterface>(SERVICE_IDENTIFIER.APP);

app.init({
    port: 3333,
    extAuthenticationUrl: "http://localhost:3000/auth/token/verify",
    db_host: "localhost",
    db_port: 28015,
    db_name: "simple_chat",
});
