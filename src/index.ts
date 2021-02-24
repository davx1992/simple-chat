import SERVICE_IDENTIFIER from './constants/identifiers';
import container from './container';
import AppService from './services/app';

const app = container.get<AppService>(SERVICE_IDENTIFIER.APP);

app.init({
  port: 3333,
  extAuthenticationUrl: 'http://localhost:4000/auth/token/verify',
  offlineMessageUrl: 'http://localhost:4000/chats/message/offline',
  db_host: 'localhost',
  db_port: 28015,
  db_name: 'simple_chat',
});
