import {
    Acknowledgment,
    ChatTypes,
    Message,
    ValidationError,
} from "../../interfaces/messaging.interface";
import { Socket } from "socket.io";
import { logger } from "../../constants/logger";
import { inject, injectable } from "inversify";
import { now } from "lodash";
import moment from "moment";
import { conn, io } from "../app";
import { r } from "rethinkdb-ts";
import { validate } from "class-validator";
import { MessagingOperations } from "./operations";
import SERVICE_IDENTIFIER from "../../constants/identifiers";
import { User, UserState } from "../../interfaces/authentication.interface";

@injectable()
export default class MessagingService {
    private _messagingOperations: MessagingOperations;

    constructor(
        @inject(SERVICE_IDENTIFIER.MESSAGING_OPERATIONS)
        messagingOperations: MessagingOperations,
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
        r.table("users")
            .insert(
                {
                    id: userId,
                    last_login_timestamp: now(),
                    last_login: moment.utc().toDate(),
                    state: UserState.ACTIVE,
                    socketId: socket.id,
                },
                { conflict: "update" },
            )
            .run(conn);

        logger.info("Connected " + socket.id + " " + userId);

        //Socket event initialization
        socket.on("message", this.onMessage.bind(null, socket));
        socket.on("create_chat", this.onCreateChat.bind(null, socket));
        socket.on("acknowledgment", this.onAcknowledgment.bind(null, socket));
        socket.on("get_users", this.onGetUsers.bind(null, socket));
        socket.on("get_chats", this.onGetChats.bind(null, socket));
        socket.on("join_chat", this.onJoinChat.bind(null, socket));
        socket.on("leave_chat", this.onLeaveChat.bind(null, socket));
        socket.on("disconnect", this.onDisconnect.bind(null, socket));

        //Send undelivered messages
        this._messagingOperations
            .loadMessageEvents(userId)
            .then((undeliveredMessages) => {
                undeliveredMessages.map((message) => {
                    //Send message to just connected user
                    socket.emit("message", message.right);
                });
            });
    };

    onGetUsers = async (
        socket: Socket,
        callback: (users) => [],
    ): Promise<void> => {
        const users = await r.table("users").run(conn);
        callback(users);
    };

    onGetChats = async (
        socket: Socket,
        callback: (chats) => [],
    ): Promise<void> => {
        const userId = socket.handshake.auth["userId"];
        const chats = await r
            .table("chat_user")
            .filter({ user_id: userId })
            .eqJoin("chat_id", r.table("chat"))
            .zip()
            .run(conn);
        callback(chats);
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
        callback: (success: boolean, error?: string) => void,
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
        callback: (success: boolean, error?: string) => void,
    ) => {
        const from: string = socket.handshake.auth["userId"];

        if (chatId) {
            await this._messagingOperations.joinChatPermanently(chatId, from);
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
        callback: (chatId?: string, error?: string) => void,
    ): Promise<void> => {
        const from: string = socket.handshake.auth["userId"];
        if (type === ChatTypes.SUC) {
            if (users.length === 2) {
                //Validate user list if it is having two people and one of them is sender
                const receipient = users.find((user) => user !== from);
                if (!receipient) {
                    logger.error(
                        "User list should contain creator and receipient",
                    );
                    callback(
                        null,
                        "User list should contain creator and receipient",
                    );
                    return;
                }
            } else {
                logger.error("Only two users should be provided for SUC chat");
                callback(
                    null,
                    "Only two users should be provided for SUC chat",
                );
                return;
            }

            //Check if chat already exists, if exists send existing chat Id
            const existingChat = await this._messagingOperations.loadSUCChat(
                users,
            );
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
                type === ChatTypes.SUC ? users : null,
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
     * Is triggered when client received message and acknowledging that message received
     *
     * @param socket connection socket instance
     * @param acknowledgment acknowledgment message
     */
    onAcknowledgment = async (
        socket: Socket,
        acknowledgment: Acknowledgment,
    ): Promise<void> => {
        const from = socket.handshake.auth["userId"];
        const { messageId } = acknowledgment;

        this._messagingOperations.deleteAcknowledgedMessageEvent(
            messageId,
            from,
        );
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
        callback: (messageId?: string, error?: ValidationError[]) => void,
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
        const chat = await this._messagingOperations.loadChatById(
            messageDto.to,
        );

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

        let receipients: User[] = [];

        //If Chat is Single User
        if (chat.type === ChatTypes.SUC) {
            const receipientId = chat.users.find((user) => user !== from);
            const receipient = await this._messagingOperations.loadChatUser(
                receipientId,
            );

            receipients = [receipient];

            //If chat is Multi user chat
        } else {
            const users = await this._messagingOperations.loadMUCUsers(chat.id);

            //Get user list
            users.map((user) => {
                if (user.right.id !== from) {
                    receipients.push(user.right);
                } else if (user.left.temp) {
                    this._messagingOperations.joinChatPermanently(
                        chat.id,
                        from,
                    );
                }
            });
        }

        //Save message to database
        const savedMessage = await this._messagingOperations.saveMessage(
            message,
            from,
            chat.id,
        );

        //Send message to receipient one by one in loop
        receipients.map((receipient) => {
            //Save message event in database
            this._messagingOperations.saveMessageEvent(
                savedMessage,
                receipient.id,
            );
            //Send message to receipient
            socket.to(receipient.socketId).emit("message", savedMessage);
        });

        //Send saved message id back to client
        callback(savedMessage.id);
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
