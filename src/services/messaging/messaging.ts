import {
  ChatTypes,
  ConnectionChatUser,
  Message,
  ValidationError,
} from "../../interfaces/messaging.interface";
import { Socket } from "socket.io";
import { logger } from "../../constants/logger";
import { inject, injectable } from "inversify";
import { conn, io } from "../app";
import { JoinResult, r } from "rethinkdb-ts";
import { validate } from "class-validator";
import { MessagingOperations } from "./operations";
import SERVICE_IDENTIFIER from "../../constants/identifiers";
import { User, UserState } from "../../interfaces/authentication.interface";

@injectable()
export default class MessagingService {
  private _messagingOperations: MessagingOperations;

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
    const userId = socket.handshake.auth["userId"];

    this._messagingOperations.saveUser(userId);
    this._messagingOperations.saveConnection(userId, socket.id);

    //TODO: Think how to handle different sessions if multiple connections
    logger.info("Connected " + socket.id + " " + userId);

    //Socket event initialization
    socket.on("message", this.onMessage.bind(null, socket));
    socket.on("create_chat", this.onCreateChat.bind(null, socket));
    // socket.on("get_users", this.onGetUsers.bind(null, socket));
    // socket.on("get_chats", this.onGetChats.bind(null, socket));
    socket.on("join_chat", this.onJoinChat.bind(null, socket));
    socket.on("leave_chat", this.onLeaveChat.bind(null, socket));
    socket.on("disconnect", this.onDisconnect.bind(null, socket));
    socket.on("load_archive", this.onLoadArchive.bind(null, socket));

    //Send undelivered messages
    this._messagingOperations
      .loadMessageEvents(userId)
      .then((undeliveredMessages) => {
        undeliveredMessages.map((message) => {
          //Send message to just connected user
          socket.emit(
            "message",
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
                logger.error("timeout on message " + userId);
              },
              2000
            )
          );
        });
      });
  };

  // onGetChats = async (
  //   socket: Socket,
  //   callback: (chats) => []
  // ): Promise<void> => {
  //   const userId = socket.handshake.auth["userId"];
  //   const chatsMuc = await r
  //     .table("chat")
  //     .filter({ type: ChatTypes.MUC })
  //     .run(conn);

  //   const chatsSUC = await r
  //     .table("chat_user")
  //     .filter({ user_id: userId })
  //     .eqJoin("chat_id", r.table("chat"))
  //     .zip()
  //     .filter((chat) => chat("type").ne(ChatTypes.MUC))
  //     .run(conn);

  //   const chats = [...chatsMuc, ...chatsSUC];
  //   callback(chats);
  // };

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
    callback: (messages?: Message[], error?: string) => void
  ) => {
    if (chatId && limit) {
      const messages = await this._messagingOperations.loadArchive(
        limit,
        chatId,
        after
      );
      callback(messages);
    } else {
      callback(null, "No chat Id or limit promvided.");
    }
  };

  /**
   * On disconnect event handler
   *
   * @param socket connection socket instance
   */
  onDisconnect = async (socket: Socket): Promise<void> => {
    const userId = socket.handshake.auth["userId"];

    this._messagingOperations.updateUserInactive(userId);
    this._messagingOperations.deleteTempJoins(userId);
    this._messagingOperations.deleteConnection(socket.id);

    logger.info("Disconnected " + userId);
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
    temp: boolean = false,
    callback: (success: boolean, error?: string) => void
  ) => {
    const from: string = socket.handshake.auth["userId"];

    if (chatId) {
      await this._messagingOperations.joinChat(chatId, from, temp);
      callback(true);
    } else {
      logger.error("No chat Id provided.");
      callback(false, "No chat Id provided.");
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
    callback: (success: boolean, error?: string) => void
  ) => {
    const from: string = socket.handshake.auth["userId"];

    if (chatId) {
      await this._messagingOperations.leaveChat(chatId, from);
      callback(true);
    } else {
      logger.error("No chat Id provided.");
      callback(false, "No chat Id provided.");
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
    callback: (chatId?: string, error?: string) => void
  ): Promise<void> => {
    const from: string = socket.handshake.auth["userId"];
    if (type === ChatTypes.SUC) {
      if (users.length === 2) {
        //Validate user list if it is having two people and one of them is sender
        const receipient = users.find((user) => user !== from);
        if (!receipient) {
          logger.error("User list should contain creator and receipient");
          callback(null, "User list should contain creator and receipient");
          return;
        }
      } else {
        logger.error("Only two users should be provided for SUC chat");
        callback(null, "Only two users should be provided for SUC chat");
        return;
      }

      //Check if chat already exists, if exists send existing chat Id
      const existingChat = await this._messagingOperations.loadSUCChat(users);
      if (existingChat.length > 0) {
        callback(existingChat[0].id);
        return;
      }
    }

    try {
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
      callback(null, err);
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
  withTimeout = (onSuccess, onTimeout, timeout) => {
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
      //Apply passed argument to success functio
      onSuccess.apply(null, args);
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
    callback: (messageId?: string, error?: ValidationError[]) => void
  ): Promise<void> => {
    const messageDto = Object.assign(new Message(), message);

    //Validate against DTO
    const errors = await validate(messageDto);

    //If errors during validation return errors and do not proceed further.
    if (errors.length > 0) {
      const error = errors.map((err) => {
        return {
          field: err.property,
          error: JSON.stringify(err.constraints),
        };
      });
      logger.error("validation failed. errors: " + JSON.stringify(error));
      callback(null, error);
      return;
    }

    const from: string = socket.handshake.auth["userId"];
    const chat = await this._messagingOperations.loadChatById(messageDto.to);

    //If chat do not exist then throw an error. Chat should exist when sending message
    if (!chat) {
      const error = {
        field: "to",
        error: "Chat do not exist, please create new chat.",
      };
      logger.error(JSON.stringify(error));
      callback(null, [error]);
      return;
    }

    //Right is User and Left is Connection
    let receipients: JoinResult<ConnectionChatUser, User>[] = [];

    //If Chat is Single User
    if (chat.type === ChatTypes.SUC) {
      const receipientId = chat.users.find((user) => user !== from);
      receipients = await this._messagingOperations.loadSUCUser(receipientId);

      //If chat is Multi user chat
    } else {
      const userConnections = await this._messagingOperations.loadMUCUsers(
        chat.id
      );

      //Used to understand if user is saved to chat users, otherwise will create new record
      let userFound: boolean = false;

      //Get user connection list
      userConnections.map((connectionUser) => {
        // console.log(connectionUser, from);

        //Check if receipient is not sender
        if (connectionUser.right.id !== from) {
          receipients.push(connectionUser);
          //If user joined chat temporary then add him permanently
        } else {
          userFound = true; //Set that we have found user in user list
          if (connectionUser.left.temp) {
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
    let onlyTyping: boolean = false;

    //Delete typing before saving or do not save if only typing
    if (
      typeof messageDto.typing !== "undefined" &&
      typeof messageDto.body !== "undefined"
    ) {
      //Copy message and then delete typing before saving
      const copy = { ...messageDto };
      delete copy.typing;
      //Save message to database
      const savedMessage = await this._messagingOperations.saveMessage(
        copy,
        from,
        chat.id
      );
      messageToSend = { ...messageDto, id: savedMessage.id };
    } else if (typeof messageDto.typing !== "undefined") {
      //If only typing do not save message but send it to participants
      messageToSend = messageDto;
      onlyTyping = true;
    } else {
      //Save message to database if standard message
      messageToSend = await this._messagingOperations.saveMessage(
        messageDto,
        from,
        chat.id
      );
    }

    //Send message to receipient one by one in loop
    receipients.map((receipient) => {
      if (receipient.right.state === UserState.ACTIVE) {
        //Send message to receipient
        io.of("/")
          .sockets.get(receipient.left.id)
          ?.emit(
            "message",
            messageToSend,
            this.withTimeout(
              () => {},
              () => {
                if (!onlyTyping) {
                  this.handleOfflineMessage(
                    messageToSend,
                    receipient.right,
                    from
                  );
                }
              },
              2000
            )
          );
      } else {
        if (!onlyTyping) {
          this.handleOfflineMessage(messageToSend, receipient.right, from);
        }
      }
    });

    //Send saved message id back to client, if message is only typing then just run callback with no params
    onlyTyping ? callback() : callback(messageToSend.id);
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
    receipient: User,
    from: string
  ): Promise<void> => {
    //Handle case when timeout reached
    //Save message event in database, so this message will be sent when connected
    this._messagingOperations.saveMessageEvent(message, receipient.id);
    logger.info("User inactive " + receipient.id);
    //TODO: send offline notification
  };

  /**
   * Initiate Socket.Io events
   *
   * @param io Server instance
   */
  initEvents = (): void => {
    io.on("connection", this.onConnect);
  };
}
