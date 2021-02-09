import {
    Chat,
    ChatTypes,
    ChatUser,
    Message,
    MessageEvent,
} from "../../interfaces/messaging.interface";
import { now } from "lodash";
import moment from "moment";
import { injectable } from "inversify";
import { logger } from "../../constants/logger";
import { conn } from "../app";
import { JoinResult, r } from "rethinkdb-ts";
import { User, UserState } from "../../interfaces/authentication.interface";

@injectable()
export class MessagingOperations {
    /**
     * Save message to database
     *
     * @param message message received from user and we are saving
     * @param from user id from which this message received
     */
    saveMessage = (
        message: Message,
        from: string,
        receipient: string,
    ): Promise<Message> => {
        return new Promise<Message>(async (resolve, reject) => {
            try {
                const { to, body, timestamp } = message;
                const savedMessage = await r
                    .table("messages")
                    .insert(
                        {
                            body,
                            from: from,
                            to: receipient,
                            chat_type: "@" + message.to.split("@")[1],
                            timestamp,
                            created: moment.utc().toDate(),
                        },
                        { returnChanges: true },
                    )
                    .run(conn);
                const insertedMessage = savedMessage.changes[0].new_val;
                resolve(insertedMessage);
            } catch (err) {
                logger.error(err);
                reject(err);
            }
        });
    };

    /**
     * @query
     * Load chat record for two users, should be used only to load SUC chat
     *
     * @param users should contain two users which are having SUC
     */
    loadSUCChat = (users: string[]): Promise<Chat[]> => {
        return new Promise<Chat[]>(async (resolve, reject) => {
            try {
                const chat = await r
                    .table("chat")
                    .filter((chat) => {
                        return chat("users").contains(users[0], users[1]);
                    })
                    .run(conn);
                resolve(chat);
            } catch (err) {
                logger.error(err);
                reject(err);
            }
        });
    };

    /**
     * @query
     * Load chat record by id
     *
     * @param users should contain two users which are having SUC
     */
    loadChatById = (chatId: string): Promise<Chat> => {
        return new Promise<Chat>(async (resolve, reject) => {
            try {
                const chat = await r.table("chat").get(chatId).run(conn);
                resolve(chat);
            } catch (err) {
                logger.error(err);
                reject(err);
            }
        });
    };

    /**
     * @query
     * Load single user from database
     *
     * @param userId user id to load
     */
    loadChatUser = (userId: string): Promise<User> => {
        return new Promise<User>(async (resolve, reject) => {
            try {
                const user = await r.table("users").get(userId).run(conn);
                resolve(user);
            } catch (err) {
                logger.error(err);
                reject(err);
            }
        });
    };

    /**
     * @query
     * Load list of chat users
     *
     * @param chatId id of chat for which to search
     * @param exclude id of user whom to exclude from query
     */
    loadMUCUsers = (
        chatId: string,
        exclude?: string,
    ): Promise<JoinResult<ChatUser, User>[]> => {
        return new Promise<JoinResult<ChatUser, User>[]>(
            async (resolve, reject) => {
                try {
                    const users = await r
                        .table("chat_user")
                        .filter(function (user) {
                            if (exclude) {
                                return user("chat_id")
                                    .eq(chatId)
                                    .and(user("user_id").ne(exclude));
                            } else {
                                return user("chat_id").eq(chatId);
                            }
                        })
                        .eqJoin("user_id", r.table("users"))
                        .run(conn);
                    resolve(users);
                } catch (err) {
                    logger.error(err);
                    reject(err);
                }
            },
        );
    };

    /**
     * Create chat, if users provided then save it along with chats record
     * this will be used in case chat is SUC, if chat is MUC chat participants
     * will be stored in seperate table chat_users.
     *
     * @param type type of the chat which to create
     * @param creator id of user who created the chat
     * @param users users list who are participants of the chat
     */
    createChat = (
        type: ChatTypes,
        creator: string,
        users?: string[],
    ): Promise<string> => {
        return new Promise<string>(async (resolve, reject) => {
            try {
                const savedChat = await r
                    .table("chat")
                    .insert(
                        {
                            type: type,
                            timestamp: now(),
                            created: moment.utc().toDate(),
                            creator,
                            ...(users && { users }),
                        },
                        { returnChanges: true },
                    )
                    .run(conn);
                const createdChat = savedChat.changes[0].new_val;
                resolve(createdChat.id);
            } catch (err) {
                logger.error(err);
                reject(err);
            }
        });
    };

    /**
     * Join to chat
     *
     * @param chatId id of chat to which user wants to join
     * @param userId id of user which is joining the chat
     */
    joinChat = (
        chatId: string,
        userId: string,
        temp: boolean = false,
    ): Promise<void> => {
        return new Promise<void>(async (resolve, reject) => {
            try {
                const alreadyJoined = await r
                    .table("message_event")
                    .filter({
                        chat_id: chatId,
                        user_id: userId,
                    })
                    .run(conn);

                if (alreadyJoined.length > 0) {
                    resolve();
                    return;
                }

                await r
                    .table("chat_user")
                    .insert({
                        chat_id: chatId,
                        user_id: userId,
                        timestamp: now(),
                        created: moment.utc().toDate(),
                        temp,
                    })
                    .run(conn);
                resolve();
            } catch (err) {
                logger.error(err);
                reject(err);
            }
        });
    };

    /**
     * Join to chat
     *
     * @param chatId id of chat to which user wants to join
     * @param userId id of user which is joining the chat
     */
    leaveChat = (chatId: string, userId: string): Promise<void> => {
        return new Promise<void>(async (resolve, reject) => {
            try {
                await r
                    .table("chat_user")
                    .filter({
                        chat_id: chatId,
                        user_id: userId,
                    })
                    .delete()
                    .run(conn);
                resolve();
            } catch (err) {
                logger.error(err);
                reject(err);
            }
        });
    };

    /**
     * Update chat user record, so it is not temporary
     * temp flag is being removed. Temp falg is used to mark user chats which
     * to which user subscribed temporary, and such subscribtion
     * will be removed on disconnection
     *
     * @param chatId id of chat to which user wants to join
     * @param userId id of user which is joining the chat
     */
    joinChatPermanently = (chatId: string, userId: string): Promise<void> => {
        return new Promise<void>(async (resolve, reject) => {
            try {
                await r
                    .table("chat_user")
                    .filter({
                        chat_id: chatId,
                        user_id: userId,
                    })
                    .update({ temp: false })
                    .run(conn);
                resolve();
            } catch (err) {
                logger.error(err);
                reject(err);
            }
        });
    };

    /**
     * Save message event to database, each new message generating
     * new message event for each receipient to whom this message will be sent.
     *
     * @param message message received and we and which will be sent to receipient
     * @param receipient receipient to whom this message will be forwarded
     */
    saveMessageEvent = (
        message: Message,
        receipient: string,
    ): Promise<MessageEvent> => {
        return new Promise<MessageEvent>(async (resolve, reject) => {
            try {
                const messageEvent = await r
                    .table("message_event")
                    .insert(
                        {
                            message_id: message.id,
                            to: receipient,
                            timestamp: now(),
                            created: moment.utc().toDate(),
                        },
                        { returnChanges: true },
                    )
                    .run(conn);
                const insertedEvent = messageEvent.changes[0].new_val;
                resolve(insertedEvent);
            } catch (err) {
                logger.error(err);
                reject(err);
            }
        });
    };

    /**
     * Delete message event of message which were acknowledged
     *
     * @param messageId id of message which were received by user
     * @param userId user id which received message
     */
    deleteAcknowledgedMessageEvent = (
        messageId: string,
        userId: string,
    ): Promise<boolean> => {
        return new Promise<boolean>(async (resolve, reject) => {
            try {
                const messageEvent = await r
                    .table("message_event")
                    .filter({
                        message_id: messageId,
                        to: userId,
                    })
                    .delete()
                    .run(conn);
                resolve(messageEvent.deleted > 0);
            } catch (err) {
                logger.error(err);
                reject(err);
            }
        });
    };

    /**
     * @query
     * Load all events of undelivered messages
     *
     * @param userId id of user for which to load events
     */
    loadMessageEvents = (
        userId: string,
    ): Promise<JoinResult<MessageEvent, Message>[]> => {
        return new Promise<JoinResult<MessageEvent, Message>[]>(
            async (resolve, reject) => {
                try {
                    const messageEvents = await r
                        .table("message_event")
                        .filter({
                            to: userId,
                        })
                        .orderBy(r.desc("timestamp"))
                        .eqJoin("message_id", r.table("messages"))
                        .run(conn);
                    resolve(messageEvents);
                } catch (err) {
                    logger.error(err);
                    reject(err);
                }
            },
        );
    };

    /**
     * Delete temporary user chats
     *
     * @param userId id of user which to update
     */
    deleteTempJoins = (userId: string): Promise<void> => {
        return new Promise<void>(async (resolve, reject) => {
            try {
                await r
                    .table("chat_user")
                    .filter({ user_id: userId, temp: true })
                    .delete()
                    .run(conn);
                resolve();
            } catch (err) {
                logger.error(err);
                reject(err);
            }
        });
    };

    /**
     * Update user with inactive status
     *
     * @param userId id of user which to update
     */
    updateUserInactive = (userId: string): Promise<void> => {
        return new Promise<void>(async (resolve, reject) => {
            try {
                await r
                    .table("users")
                    .get(userId)
                    .update({ state: UserState.INACTIVE })
                    .run(conn);
                resolve();
            } catch (err) {
                logger.error(err);
                reject(err);
            }
        });
    };
}
