import {
  Chat,
  ChatTypes,
  ChatUser,
  Message,
  MessageEvent,
  Receipient,
} from "../../interfaces/messaging.interface";
import { now } from "lodash";
import moment from "moment";
import { injectable } from "inversify";
import { logger } from "../../constants/logger";
import { conn } from "../app";
import { JoinResult, r } from "rethinkdb-ts";
import { User } from "../../interfaces/authentication.interface";

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
    chatId: string
  ): Promise<Message> => {
    return new Promise<Message>(async (resolve, reject) => {
      try {
        const { body, timestamp } = message;
        const savedMessage = await r
          .table("messages")
          .insert(
            {
              body,
              from: from,
              to: chatId,
              timestamp,
              created: moment.utc().toDate(),
            },
            { returnChanges: true }
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
        console.time("load suc chat");
        const chat = await r
          .table("chat")
          .filter((chat) => {
            return chat("users").contains(users[0], users[1]);
          })
          .run(conn);
        console.timeEnd("load suc chat");
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
  loadUser = (userId: string): Promise<User[]> => {
    return new Promise<User[]>(async (resolve, reject) => {
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
   * Load SUC chat receipient connection
   *
   * @param userId receipient user id
   * @param chatId SUC chat id
   */
  loadSUCUser = (userId: string): Promise<Receipient> => {
    return new Promise<Receipient>(async (resolve, reject) => {
      try {
        const receipient = (await r
          .table("users")
          .get(userId)
          .merge(function (user) {
            return {
              connections: r
                .table("connections")
                .getAll(user("id"), { index: "user_id" })
                .coerceTo("array"),
            };
          })
          .pluck("connections", "id", "state")
          .merge({
            user_id: r.row("id"),
          })
          .without("id")
          .run(conn)) as Receipient;

        resolve(receipient);
      } catch (err) {
        logger.error(err);
        reject(err);
      }
    });
  };

  /**
   * @query
   * Load list of chat users, will return on the left connection with chat temp flag,
   * on the right user object
   * Consider if exclude is needed, not decided yet
   *
   * @param chatId id of chat for which to search
   * @param exclude id of user whom to exclude from query
   */
  loadMUCUsers = (chatId: string): Promise<Receipient[]> => {
    return new Promise<Receipient[]>(async (resolve, reject) => {
      try {
        console.time("receipient fetch");
        const receipients = (await r
          .table("chat_user")
          .getAll(chatId, { index: "chat_id" })
          .merge(function (chat) {
            return {
              connections: r
                .table("connections")
                .getAll(chat("user_id"), { index: "user_id" })
                .coerceTo("array"),
              state: r.table("users").get(chat("user_id"))("state"),
            };
          })
          .pluck("connections", "user_id", "state", "temp")
          .run(conn)) as Receipient[];
        console.timeEnd("receipient fetch");

        resolve(receipients);
      } catch (err) {
        logger.error(err);
        reject(err);
      }
    });
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
    users?: string[]
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
            { returnChanges: true }
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
   * @query
   * Get list of all inactive chats, which had no messages after speicific time.
   * Time is provided in timestmap, if any message were not sent after provided timestmap
   * then chat will be considered as inactive.
   *
   * @param timestamp from which time to consider chat as inactive  - from timestamp
   */
  loadInactiveChats = (timestamp: number): Promise<string[]> => {
    return new Promise<string[]>(async (resolve, reject) => {
      try {
        const chatIds = await r
          .table("chat")
          .filter((chat) => {
            return r.and(
              r
                .db("simple_chat")
                .table("messages")
                .between([chat("id"), timestamp], [chat("id"), r.maxval], {
                  index: "to_timestamp",
                })
                .isEmpty(),
              chat("timestamp").le(timestamp)
            );
          })("id")
          .coerceTo("array")
          .run(conn);

        resolve(chatIds);
      } catch (err) {
        logger.error(err);
        reject(err);
      }
    });
  };

  /**
   * Delete all chat and chat related entities - chat, chat users, messages
   *
   * @param chatId id of the chat to delete
   */
  deleteChat = (chatId: string): Promise<void> => {
    return new Promise<void>(async (resolve, reject) => {
      try {
        await r.table("chat").get(chatId).delete().run(conn);

        await r
          .table("chat_user")
          .getAll(chatId, { index: "chat_id" })
          .delete()
          .run(conn);

        await r
          .table("messages")
          .getAll(chatId, { index: "to" })
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
   * @query
   * Fetch message archive for chat. If @param after not provided will be fetched only last messages
   * If param provided then messages will be loaded which are having timestamp before specific message id
   *
   * @param limit how many records to return
   * @param chatId id of the chat from which fetch archive
   * @param after after which message id to fetch archive
   */
  loadArchive = (
    limit: number,
    chatId: string,
    after?: string
  ): Promise<Message[]> => {
    return new Promise<Message[]>(async (resolve, reject) => {
      try {
        if (after) {
          const messages = await r
            .table("messages")
            .between(
              [chatId, r.minval],
              [chatId, r.table("messages").get(after)("timestamp")],
              { index: "to_timestamp" }
            )
            .orderBy({ index: r.desc("to_timestamp") })
            .limit(limit)
            .run(conn);
          resolve(messages);
        } else {
          const messages = await r
            .table("messages")
            .orderBy({ index: r.desc("timestamp") })
            .filter({ to: chatId })
            .limit(limit)
            .run(conn);

          resolve(messages);
        }
      } catch (err) {
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
    temp: boolean = false
  ): Promise<void> => {
    return new Promise<void>(async (resolve, reject) => {
      try {
        const alreadyJoined: ChatUser[] = await r
          .table("chat_user")
          .filter({
            chat_id: chatId,
            user_id: userId,
          })
          .run(conn);

        if (alreadyJoined.length > 0) {
          //If current Chat user is saved with temp flag,
          //but current request is without this flag, then join permanently
          if (alreadyJoined[0].temp && !temp) {
            await this.joinChatPermanently(chatId, userId);
          }
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
    receipient: string
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
            { returnChanges: true }
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
    userId: string
  ): Promise<boolean> => {
    return new Promise<boolean>(async (resolve, reject) => {
      try {
        const messageEvent = await r
          .table("message_event")
          .getAll([userId, messageId], { index: "to_message_id" })
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
    userId: string
  ): Promise<JoinResult<MessageEvent, Message>[]> => {
    return new Promise<JoinResult<MessageEvent, Message>[]>(
      async (resolve, reject) => {
        try {
          const messageEvents = await r
            .table("message_event")
            .between(
              [userId, r.minval, r.minval],
              [userId, r.maxval, r.maxval],
              { index: "to_message_id_timestamp", rightBound: "closed" }
            )
            .orderBy({ index: r.desc("to_message_id_timestamp") })
            .eqJoin("message_id", r.table("messages"))
            .run(conn);
          resolve(messageEvents);
        } catch (err) {
          logger.error(err);
          reject(err);
        }
      }
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
   * Save user in database with socket id
   *
   * @param userId user id which to save - this will be primary key
   */
  saveUser = (userId: string): Promise<void> => {
    return new Promise<void>(async (resolve, reject) => {
      try {
        r.table("users")
          .insert(
            {
              id: userId,
              last_login_timestamp: now(),
              last_login: moment.utc().toDate(),
            },
            { conflict: "update" }
          )
          .run(conn);
        resolve();
      } catch (err) {
        logger.error(err);
        reject(err);
      }
    });
  };

  /**
   * Save connection in database with socket id
   *
   * @param userId user id which to save - this will be primary key
   * @param socketId socket id of connection of user
   */
  saveConnection = (userId: string, socketId: string): Promise<void> => {
    return new Promise<void>(async (resolve, reject) => {
      try {
        await r
          .table("connections")
          .insert({
            id: socketId,
            timestamp: now(),
            created: moment.utc().toDate(),
            user_id: userId,
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
   * Delete conenction record from database
   *
   * @param socketId socket id which to delete
   */
  deleteConnection = (socketId: string): Promise<void> => {
    return new Promise<void>(async (resolve, reject) => {
      try {
        await r.table("connections").get(socketId).delete().run(conn);
        resolve();
      } catch (err) {
        logger.error(err);
        reject(err);
      }
    });
  };
}
