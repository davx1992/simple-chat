import {
  Chat,
  ChatTypes,
  ChatUser,
  Message,
  MessageEvent,
  Receipient,
} from '../../interfaces/messaging.interface';
import { now } from 'lodash';
import moment from 'moment';
import { injectable } from 'inversify';
import { logger } from '../../constants/logger';
import { conn } from '../app';
import { JoinResult, r } from 'rethinkdb-ts';
import { User } from '../../interfaces/authentication.interface';

@injectable()
export class MessagingOperations {
  /**
   * Save message to database
   *
   * @param message message object to save
   * @param from user id from which this message received
   */
  saveMessage = async (messageToSave: Message): Promise<Message> => {
    // console.time('message saved');
    try {
      const savedMessage = await r
        .table('messages')
        .insert(messageToSave, { returnChanges: true })
        .run(conn);

      // console.timeEnd('message saved');
      return savedMessage.changes[0].new_val;
    } catch (err) {
      logger.error(err);
      throw new Error(err);
    }
  };

  /**
   * @query
   * Load chat record for two users, should be used only to load SUC chat
   *
   * @param users should contain two users which are having SUC
   */
  loadSUCChat = async (users: string[]): Promise<Chat[]> => {
    try {
      // console.time('load suc chat');
      const chat = await r
        .table('chat')
        .filter((chat) => {
          return chat('users').contains(users[0], users[1]);
        })
        .run(conn);
      // console.timeEnd('load suc chat');
      return chat;
    } catch (err) {
      logger.error(err);
      throw new Error(err);
    }
  };

  /**
   * @query
   * Load chat record by id
   *
   * @param users should contain two users which are having SUC
   */
  loadChatById = async (chatId: string): Promise<Chat> => {
    try {
      const chat = await r.table('chat').get(chatId).run(conn);
      return chat;
    } catch (err) {
      logger.error(err);
      throw new Error(err);
    }
  };

  /**
   * @query
   * Load single user from database
   *
   * @param userId user id to load
   */
  loadUser = async (userId: string): Promise<User[]> => {
    try {
      const user = await r.table('users').get(userId).run(conn);
      return user;
    } catch (err) {
      logger.error(err);
      throw new Error(err);
    }
  };

  /**
   * @query
   * Load SUC chat receipient connection
   *
   * @param userId receipient user id
   * @param chatId SUC chat id
   */
  loadSUCUser = async (userId: string): Promise<Receipient> => {
    try {
      const receipient = (await r
        .table('users')
        .get(userId)
        .merge(function (user) {
          return {
            connections: r
              .table('connections')
              .getAll(user('id'), { index: 'user_id' })
              .coerceTo('array'),
          };
        })
        .pluck('connections', 'id', 'state')
        .merge({
          user_id: r.row('id'),
        })
        .without('id')
        .run(conn)) as Receipient;

      return receipient;
    } catch (err) {
      logger.error(err);
      throw new Error(err);
    }
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
  loadMUCUsers = async (chatId: string): Promise<Receipient[]> => {
    try {
      // console.time('receipient fetch');
      const receipients = (await r
        .table('chat_user')
        .getAll(chatId, { index: 'chat_id' })
        .merge(function (chat) {
          return {
            connections: r
              .table('connections')
              .getAll(chat('user_id'), { index: 'user_id' })
              .coerceTo('array'),
          };
        })
        .pluck('connections', 'user_id', 'temp')
        .run(conn)) as Receipient[];
      // console.timeEnd('receipient fetch');
      return receipients;
    } catch (err) {
      logger.error(err);
      throw new Error(err);
    }
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
  createChat = async (
    type: ChatTypes,
    creator: string,
    users?: string[]
  ): Promise<string> => {
    try {
      const savedChat = await r
        .table('chat')
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
      return createdChat.id;
    } catch (err) {
      logger.error(err);
      throw new Error(err);
    }
  };

  /**
   * @query
   * Get list of all inactive chats, which had no messages after speicific time.
   * Time is provided in timestmap, if any message were not sent after provided timestmap
   * then chat will be considered as inactive.
   *
   * @param timestamp from which time to consider chat as inactive  - from timestamp
   */
  loadInactiveChats = async (timestamp: number): Promise<string[]> => {
    try {
      const chatIds = await r
        .table('chat')
        .filter((chat) => {
          return r.and(
            r
              .db('simple_chat')
              .table('messages')
              .between([chat('id'), timestamp], [chat('id'), r.maxval], {
                index: 'to_timestamp',
              })
              .isEmpty(),
            chat('timestamp').le(timestamp)
          );
        })('id')
        .coerceTo('array')
        .run(conn);

      return chatIds;
    } catch (err) {
      logger.error(err);
      throw new Error(err);
    }
  };

  /**
   * Delete all chat and chat related entities - chat, chat users, messages
   *
   * @param chatId id of the chat to delete
   */
  deleteChat = async (chatId: string): Promise<void> => {
    try {
      await r.table('chat').get(chatId).delete().run(conn);
      await r
        .table('chat_user')
        .getAll(chatId, { index: 'chat_id' })
        .delete()
        .run(conn);
      await r
        .table('messages')
        .getAll(chatId, { index: 'to' })
        .delete()
        .run(conn);
      await r
        .table('message_event')
        .getAll(chatId, { index: 'chat_id' })
        .delete()
        .run(conn);
    } catch (err) {
      logger.error(err);
      throw new Error(err);
    }
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
  loadArchive = async (
    limit: number,
    chatId: string,
    after?: string
  ): Promise<Message[]> => {
    try {
      await this.checkIfChatExists(chatId);
      if (after) {
        const afterMessage = await r.table('messages').get(after).run(conn);
        if (afterMessage) {
          const messages = await r
            .table('messages')
            .between([chatId, r.minval], [chatId, afterMessage('timestamp')], {
              index: 'to_timestamp',
            })
            .orderBy({ index: r.desc('to_timestamp') })
            .limit(limit)
            .run(conn);
          return messages;
        } else {
          throw new Error('Message with provided Id do not exist.');
        }
      } else {
        const messages = await r
          .table('messages')
          .orderBy({ index: r.desc('timestamp') })
          .filter({ to: chatId })
          .limit(limit)
          .run(conn);

        return messages;
      }
    } catch (err) {
      throw new Error(err);
    }
  };

  /**
   * Join to chat
   *
   * @param chatId id of chat to which user wants to join
   * @param userId id of user which is joining the chat
   */
  joinChat = async (
    chatId: string,
    userId: string,
    temp = false
  ): Promise<void> => {
    try {
      await this.checkIfChatExists(chatId);
      const alreadyJoined: ChatUser[] = await r
        .table('chat_user')
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
        return;
      }

      await r
        .table('chat_user')
        .insert({
          chat_id: chatId,
          user_id: userId,
          timestamp: now(),
          created: moment.utc().toDate(),
          temp,
        })
        .run(conn);
    } catch (err) {
      throw new Error(err);
    }
  };

  /**
   * Join to chat
   *
   * @param chatId id of chat to which user wants to join
   * @param userId id of user which is joining the chat
   */
  leaveChat = async (chatId: string, userId: string): Promise<void> => {
    try {
      await this.checkIfChatExists(chatId);
      await r
        .table('chat_user')
        .filter({
          chat_id: chatId,
          user_id: userId,
        })
        .delete()
        .run(conn);
    } catch (err) {
      throw new Error(err);
    }
  };

  /**
   * Helper function to check if chat exists, will throw error if doesnt exist
   *
   * @param chatId chat id which to check
   */
  checkIfChatExists = async (chatId: string): Promise<boolean> => {
    const chatExists = await this.loadChatById(chatId);
    if (!chatExists) {
      throw new Error(`Chat ${chatId} do not exist.`);
    } else {
      return !!chatExists;
    }
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
  joinChatPermanently = async (
    chatId: string,
    userId: string
  ): Promise<void> => {
    try {
      await this.checkIfChatExists(chatId);
      await r
        .table('chat_user')
        .filter({
          chat_id: chatId,
          user_id: userId,
        })
        .update({ temp: false })
        .run(conn);
    } catch (err) {
      throw new Error(err);
    }
  };

  /**
   * Save message event to database, each new message generating
   * new message event for each receipient to whom this message will be sent.
   *
   * @param message message received and we and which will be sent to receipient
   * @param receipient receipient to whom this message will be forwarded
   */
  saveMessageEvent = async (
    message: Message,
    receipient: string
  ): Promise<MessageEvent> => {
    try {
      const messageEvent = await r
        .table('message_event')
        .insert(
          {
            message_id: message.id,
            to: receipient,
            timestamp: now(),
            chat_id: message.to,
            created: moment.utc().toDate(),
          },
          { returnChanges: true }
        )
        .run(conn);
      const insertedEvent = messageEvent.changes[0].new_val;
      return insertedEvent;
    } catch (err) {
      logger.error(err);
      throw new Error(err);
    }
  };

  /**
   * Delete message event of message which were acknowledged
   *
   * @param messageId id of message which were received by user
   * @param userId user id which received message
   */
  deleteAcknowledgedMessageEvent = async (
    messageId: string,
    userId: string
  ): Promise<boolean> => {
    try {
      const messageEvent = await r
        .table('message_event')
        .getAll([userId, messageId], { index: 'to_message_id' })
        .delete()
        .run(conn);
      return messageEvent.deleted > 0;
    } catch (err) {
      logger.error(err);
      throw new Error(err);
    }
  };

  /**
   * @query
   * Load all events of undelivered messages
   *
   * @param userId id of user for which to load events
   */
  loadMessageEvents = async (
    userId: string
  ): Promise<JoinResult<MessageEvent, Message>[]> => {
    try {
      const messageEvents = await r
        .table('message_event')
        .between([userId, r.minval, r.minval], [userId, r.maxval, r.maxval], {
          index: 'to_message_id_timestamp',
          rightBound: 'closed',
        })
        .orderBy({ index: r.desc('to_message_id_timestamp') })
        .eqJoin('message_id', r.table('messages'))
        .run(conn);
      return messageEvents;
    } catch (err) {
      logger.error(err);
      throw new Error(err);
    }
  };

  /**
   * Delete temporary user chats
   *
   * @param userId id of user which to update
   */
  deleteTempJoins = async (userId: string): Promise<void> => {
    try {
      await r
        .table('chat_user')
        .filter({ user_id: userId, temp: true })
        .delete()
        .run(conn);
    } catch (err) {
      logger.error(err);
      throw new Error(err);
    }
  };

  /**
   * Save user in database with socket id
   *
   * @param userId user id which to save - this will be primary key
   */
  saveUser = async (userId: string): Promise<void> => {
    try {
      r.table('users')
        .insert(
          {
            id: userId,
            last_login_timestamp: now(),
            last_login: moment.utc().toDate(),
          },
          { conflict: 'update' }
        )
        .run(conn);
    } catch (err) {
      logger.error(err);
      throw new Error(err);
    }
  };

  /**
   * Save connection in database with socket id
   *
   * @param userId user id which to save - this will be primary key
   * @param socketId socket id of connection of user
   */
  saveConnection = async (userId: string, socketId: string): Promise<void> => {
    try {
      await r
        .table('connections')
        .insert({
          id: socketId,
          timestamp: now(),
          created: moment.utc().toDate(),
          user_id: userId,
        })
        .run(conn);
    } catch (err) {
      logger.error(err);
      throw new Error(err);
    }
  };

  /**
   * Delete conenction record from database
   *
   * @param socketId socket id which to delete
   */
  deleteConnection = async (socketId: string): Promise<void> => {
    try {
      await r.table('connections').get(socketId).delete().run(conn);
    } catch (err) {
      logger.error(err);
      throw new Error(err);
    }
  };
}
