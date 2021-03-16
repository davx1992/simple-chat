import {
  AppError,
  ChatTypes,
  Message,
  Receipient,
} from '../../interfaces/messaging.interface';
import { Socket } from 'socket.io';
import { logger } from '../../constants/logger';
import { inject, injectable } from 'inversify';
import { conn, io } from '../app';
import { validate } from 'class-validator';
import { MessagingOperations } from './operations';
import SERVICE_IDENTIFIER from '../../constants/identifiers';
import axios from 'axios';
import { AppConfig } from '../../interfaces/app.interface';
import { r } from 'rethinkdb-ts';
import moment from 'moment';
import { ERRORS } from '../../constants/errors';

@injectable()
export default class MessagingService {
  private _messagingOperations: MessagingOperations;
  private _config: AppConfig;

  constructor(
    @inject(SERVICE_IDENTIFIER.MESSAGING_OPERATIONS)
    messagingOperations: MessagingOperations
  ) {
    this._messagingOperations = messagingOperations;
  }

  /**
   * On connection event handler
   *
   * @param socket connection socket instance
   */
  onConnect = (socket: Socket): void => {
    try {
      const userId = socket.handshake.auth['userId'];

      this._messagingOperations.saveUser(userId);
      this._messagingOperations.saveConnection(userId, socket.id);

      logger.info('Connected ' + socket.id + ' ' + userId);

      //Socket event initialization
      socket.on('message', this.onMessage.bind(null, socket));
      socket.on('create_chat', this.onCreateChat.bind(null, socket));
      socket.on('join_chat', this.onJoinChat.bind(null, socket));
      socket.on('leave_chat', this.onLeaveChat.bind(null, socket));
      socket.on('disconnect', this.onDisconnect.bind(null, socket));
      socket.on('load_archive', this.onLoadArchive.bind(null, socket));

      //Send undelivered messages
      this._messagingOperations
        .loadMessageEvents(userId)
        .then((undeliveredMessages) => {
          undeliveredMessages.map((message) => {
            //Send message to just connected user
            socket.emit(
              'message',
              message.right,
              this.withTimeout(
                () => {
                  //Delete message event if message received by client
                  this._messagingOperations.deleteAcknowledgedMessageEvent(
                    message.right.id,
                    userId
                  );
                },
                () => {
                  logger.error('timeout on message ' + userId);
                },
                2000
              )
            );
          });
        });
    } catch (error) {
      logger.error(error);
    }
  };

  /**
   *
   * @param socket connection socket instance
   * @param callback callback function to provide messages to client
   */
  onLoadArchive = async (
    socket: Socket,
    chatId: string,
    limit: number,
    after: string = null,
    callback: (messages?: Message[], error?: AppError) => void
  ): Promise<void> => {
    try {
      if (chatId && limit) {
        const messages = await this._messagingOperations.loadArchive(
          limit,
          chatId,
          after
        );
        callback(messages);
      } else {
        callback(null, { code: 3000, error: ERRORS[3000] });
      }
    } catch (error) {
      callback(null, { code: 2002, error: ERRORS[2002] });
      logger.error(error);
    }
  };

  /**
   * On disconnect event handler
   *
   * @param socket connection socket instance
   */
  onDisconnect = async (socket: Socket): Promise<void> => {
    try {
      const userId = socket.handshake.auth['userId'];

      this._messagingOperations.deleteTempJoins(userId);
      this._messagingOperations.deleteConnection(socket.id);

      logger.info('Disconnected ' + userId);
    } catch (error) {
      logger.error(error);
    }
  };

  /**
   * Join to chat
   *
   * @param socket socket instance of user connection
   * @param chatId id of the chat to which user wants to join
   * @param callback when user joined chat inform if it was sucess or failed
   */
  onJoinChat = async (
    socket: Socket,
    chatId: string,
    temp = false,
    callback: (success: boolean, error?: AppError) => void
  ): Promise<void> => {
    try {
      const from: string = socket.handshake.auth['userId'];

      if (chatId) {
        await this._messagingOperations.joinChat(chatId, from, temp);
        callback(true);
      } else {
        logger.error(ERRORS[3000]);
        callback(false, { code: 3000, error: ERRORS[3000] });
      }
    } catch (error) {
      logger.error(error);
      callback(false, { code: 3000, error: ERRORS[3000] });
    }
  };

  /**
   * Leave the chat
   *
   * @param socket socket instance of user connection
   * @param chatId id of the chat which to leave
   * @param callback when user left chat inform if it was sucess or failed
   */
  onLeaveChat = async (
    socket: Socket,
    chatId: string,
    callback: (success: boolean, error?: AppError) => void
  ): Promise<void> => {
    try {
      const from: string = socket.handshake.auth['userId'];
      if (chatId) {
        await this._messagingOperations.leaveChat(chatId, from);
        callback(true);
      } else {
        logger.error(ERRORS[3000]);
        callback(false, { code: 3000, error: ERRORS[3000] });
      }
    } catch (error) {
      logger.error(error);
      callback(false, { code: 3000, error: ERRORS[3000] });
    }
  };

  /**
   * Create chat, will be used for MUC chats
   *
   * @param socket socket instance of user connection
   * @param users user id list which will be chat users
   * @param callback when chat will be created chat id will be sent back
   */
  onCreateChat = async (
    socket: Socket,
    type: ChatTypes,
    users: string[],
    callback: (chatId?: string, error?: AppError) => void
  ): Promise<void> => {
    try {
      const from: string = socket.handshake.auth['userId'];
      if (type === ChatTypes.SUC) {
        if (users.length === 2) {
          //Validate user list if it is having two people and one of them is sender
          const receipient = users.find((user) => user !== from);
          if (!receipient) {
            logger.error(ERRORS[1000]);
            callback(null, { code: 1000, error: ERRORS[1000] });
            return;
          }
        } else {
          logger.error(ERRORS[1001]);
          callback(null, { code: 1001, error: ERRORS[1001] });
          return;
        }

        //Check if chat already exists, if exists send existing chat Id
        const existingChat = await this._messagingOperations.loadSUCChat(users);
        if (existingChat.length > 0) {
          callback(existingChat[0].id);
          return;
        }
      }

      //Create chat record
      const chatId = await this._messagingOperations.createChat(
        type,
        from,
        type === ChatTypes.SUC ? users : null
      );

      //Create user chat record
      if (type === ChatTypes.SUC) {
        this._messagingOperations.joinChat(chatId, users[0]);
        this._messagingOperations.joinChat(chatId, users[1]);
      } else {
        this._messagingOperations.joinChat(chatId, from);
      }

      //Send chat id back to client
      callback(chatId);
    } catch (err) {
      logger.error(err);
      callback(null, { code: 2001, error: ERRORS[2001] });
    }
  };

  /**
   * This function will return function which will be called if message
   * was received by client, otherwise timeout will be thrown
   *
   * @param onSuccess when client received message, this function will be called
   * @param onTimeout when client do not reply within timeout, this function will be called
   * @param timeout timeout how much time to wait for acknowledgment in miliseconds
   */
  withTimeout = (
    onSuccess: (...args: any[]) => void,
    onTimeout: () => void,
    timeout: number
  ): ((...args: any[]) => void) => {
    let called = false;

    const timer = setTimeout(() => {
      //If after timeout callback is not yet called, then throw timeout
      if (called) return;
      called = true;
      onTimeout();
    }, timeout);

    return (...args) => {
      //If callback called then set called true
      if (called) return;
      called = true;
      clearTimeout(timer);

      if (onSuccess) {
        onSuccess(...args);
      }
    };
  };

  /**
   * Triggered when user sends message from application
   *
   * @param socket connection socket instance
   * @param message message sender wants to send
   * @param callback when message saved, id of message will be sent back to sender
   */
  onMessage = async (
    socket: Socket,
    message: Message,
    callback: (messageId?: string, error?: AppError) => void
  ): Promise<void> => {
    try {
      console.time('message handler');
      const messageDto = Object.assign(new Message(), message);

      //Validate against DTO
      const errors = await validate(messageDto);

      //If errors during validation return errors and do not proceed further.
      if (errors.length > 0) {
        const error = {
          code: 2000,
          error: ERRORS[2000],
        };
        logger.error(JSON.stringify(error));
        callback(null, error);
        return;
      }

      const from: string = socket.handshake.auth['userId'];
      const chat = await this._messagingOperations.loadChatById(messageDto.to);

      //If chat do not exist then throw an error. Chat should exist when sending message
      if (!chat) {
        const error = {
          code: 4004,
          error: ERRORS[4004],
        };
        logger.error(JSON.stringify(error));
        callback(null, error);
        return;
      }

      //If chat is blocked do not send message, and return an error
      if (chat.blocked) {
        callback(null, {
          code: 4003,
          error: ERRORS[4003],
        });
        return;
      }

      //Receipient list
      let receipients: Receipient[] = [];

      //If Chat is Single User
      if (chat.type === ChatTypes.SUC) {
        const receipientId = chat.users.find((user) => user !== from);
        const result = await this._messagingOperations.loadSUCUser(
          receipientId
        );
        receipients = [result];

        //If chat is Multi user chat
      } else {
        const result = await this._messagingOperations.loadMUCUsers(chat.id);

        //Used to understand if user is saved to chat users, otherwise will create new record
        let userFound = false;

        //Get user connection list
        result.map((receipient) => {
          // console.log(connectionUser, from);

          //Check if receipient is not sender
          if (receipient.user_id !== from) {
            receipients.push(receipient);
            //If user joined chat temporary then add him permanently
          } else {
            userFound = true; //Set that we have found user in user list
            if (receipient.temp) {
              this._messagingOperations.joinChatPermanently(chat.id, from);
            }
          }
        });

        //If user is not found in chat user list, it means due to some error it was not joined as per the process
        //Lets create new chat user then, applicable only to MUC chat
        if (!userFound) {
          this._messagingOperations.joinChat(chat.id, from);
        }
      }

      let messageToSend: Message;
      let onlyTyping = false;

      //If sending typing then do not save message
      if (
        typeof messageDto.typing !== 'undefined' &&
        typeof messageDto.body === 'undefined'
      ) {
        //If only typing do not save message but send it to participants
        messageToSend = messageDto;
        onlyTyping = true;
      } else {
        //If standard message then save to database,
        //Before saving create JSON of message and get UUID, and do not wait when saved,
        //To reduce processing time until Id received,
        //we are getting uuid and then saving asynchronisly
        const { body, timestamp } = messageDto;
        const messageId = await r.uuid().run(conn);
        const messageToSave = {
          id: messageId,
          body,
          from: from,
          to: chat.id,
          timestamp,
          created: moment.utc().toDate(),
        };
        //Save message to database if standard message
        this._messagingOperations.saveMessage(messageToSave);
        //Add typing tag if needed
        messageToSend = {
          ...messageToSave,
          ...(typeof messageDto.typing !== 'undefined' && {
            typing: messageDto.typing,
          }),
        };
      }

      //Send message to receipient one by one in loop
      receipients.map((receipient) => {
        if (receipient.connections?.length > 0) {
          receipient.connections.map((connection) => {
            //Send message to receipient
            io.of('/')
              .sockets.get(connection.id)
              ?.emit(
                'message',
                messageToSend,
                this.withTimeout(
                  null,
                  () => {
                    if (!onlyTyping) {
                      this.handleOfflineMessage(messageToSend, receipient);
                    }
                  },
                  2000
                )
              );
          });
        } else {
          if (!onlyTyping) {
            this.handleOfflineMessage(messageToSend, receipient);
          }
        }
      });

      //Send saved message id back to client, if message is only typing then just run callback with no params
      onlyTyping ? callback() : callback(messageToSend.id);
      console.timeEnd('message handler');
    } catch (error) {
      callback(null, { code: 2000, error: ERRORS[2000] });
      logger.error(JSON.stringify(error));
    }
  };

  /**
   * Handle message when receipient is offline
   *
   * @param message message object
   * @param receipient message receipient
   * @param from message sender id
   */
  handleOfflineMessage = async (
    message: Message,
    receipient: Receipient
  ): Promise<void> => {
    try {
      //Handle case when timeout reached
      //Save message event in database, so this message will be sent when connected
      this._messagingOperations.saveMessageEvent(message, receipient.user_id);
      logger.info('User inactive ' + receipient.user_id);

      //If offline message url is provided then push message to external API to send notification
      if (this._config.offlineMessageUrl) {
        axios
          .post<void>(this._config.offlineMessageUrl, {
            message,
          })
          .catch((err) => {
            logger.error(err);
          });
      }
    } catch (error) {
      logger.error(error);
    }
  };

  /**
   * Initiate Socket.Io events
   *
   * @param io Server instance
   */
  initEvents = (config: AppConfig): void => {
    this._config = config;
    io.on('connection', this.onConnect);
  };
}
