import 'reflect-metadata';
import { Container } from 'inversify';
import SERVICE_IDENTIFIER from './constants/identifiers';
import AppService from './services/app.service';
import MessagingService from './services/messaging/messaging.service';
import AuthenticationService from './services/authentication.service';
import { MessagingOperations } from './services/messaging/messaging.operations';
import { ApiService } from './services/api.service';

const container = new Container();

container.bind<AppService>(SERVICE_IDENTIFIER.APP).to(AppService);
container.bind<ApiService>(SERVICE_IDENTIFIER.API).to(ApiService);
container
  .bind<MessagingService>(SERVICE_IDENTIFIER.MESSAGING)
  .to(MessagingService);
container
  .bind<MessagingOperations>(SERVICE_IDENTIFIER.MESSAGING_OPERATIONS)
  .to(MessagingOperations);
container
  .bind<AuthenticationService>(SERVICE_IDENTIFIER.AUTHENTICATION)
  .to(AuthenticationService);

export default container;
