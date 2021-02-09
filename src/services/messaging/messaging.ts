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

    /**
     * Create chat, will be used for MUC chats
     *
     * @param socket socket instance of user connection
     * @param callback when chat will be created chat id will be sent back
     */
    onCreateChat = async (
        socket: Socket,
        callback: (chatId?: string, error?: string) => void,
    ): Promise<void> => {
        const from: string = socket.handshake.auth["userId"];
        try {
            const chatId = await this._messagingOperations.createChat(
                ChatTypes.MUC,
                from,
            );
            callback(chatId);
        } catch (err) {
            logger.error(err);
            callback(null, err);
        }
    };

    /**
     * On disconnect event handler
     */
    onDisconnect = (): void => {
        //TODO: handle disconnect event
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
        const receipientId = messageDto.to.split("@")[0];
        let receipeints: User[] = [];

        //If Chat is Single User
        if (this.isSingleUserChat(messageDto.to)) {
            if (receipientId === from) {
                const error = {
                    field: "to",
                    error: "Sender and receipient is same user.",
                };
                logger.error(JSON.stringify(error));
                callback(null, [error]);
                return;
            }

            const chat = await this._messagingOperations.loadSUCChat([
                from,
                receipientId,
            ]);

            //If no chat exists now, then create new record
            if (chat.length === 0) {
                const chatId = await this._messagingOperations.createChat(
                    ChatTypes.SUC,
                    from,
                    [from, receipientId],
                );
                this._messagingOperations.joinChat(chatId, receipientId);
                this._messagingOperations.joinChat(chatId, from);
            }

            const receipient = await this._messagingOperations.loadChatUser(
                receipientId,
            );

            receipeints = [receipient];

            //If chat is Multi user chat
        } else {
            //TODO: handle muc case
        }

        //Save message to database
        const savedMessage = await this._messagingOperations.saveMessage(
            message,
            from,
            receipientId,
        );

        //Send message to receipient one by one in loop
        receipeints.map((receipient) => {
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
     * Check it receipient is Single User chat or Multi user chat,
     * If true then it is SUC and if false then it is MUC
     *
     * @param to receipient from the message
     */
    isSingleUserChat = (to: string): boolean => {
        return to.includes(ChatTypes.SUC);
    };

    /**
     * Initiate Socket.Io events
     *
     * @param io Server instance
     */
    initEvents = (): void => {
        io.on("connection", this.onConnect);
        io.on("disconnect", this.onDisconnect);
    };
}
