import { inject, injectable } from 'inversify';
import SERVICE_IDENTIFIER from '../constants/identifiers';
import {
  BlockChatDTO,
  JoinChatDTO,
  LeaveChatDTO,
  NewChatDTO,
  TimeEntity,
} from '../interfaces/api.interface';
import { ChatTypes } from '../interfaces/messaging.interface';
import { MessagingOperations } from './messaging/operations';
import moment from 'moment';
import { logger } from '../constants/logger';

@injectable()
export class ApiService {
  constructor(
    @inject(SERVICE_IDENTIFIER.MESSAGING_OPERATIONS)
    private _messagingOperations: MessagingOperations
  ) {}

  /**
   * Create new chat in database and join users of creator
   *
   * @param chat new chat object
   */
  async createChat(chat: NewChatDTO): Promise<string> {
    const { type, userId, users } = chat;

    if (type === ChatTypes.SUC) {
      //Check if chat already exists, if exists send existing chat Id
      const existingChat = await this._messagingOperations.loadSUCChat(users);
      if (existingChat.length > 0) {
        return existingChat[0].id;
      }
    }

    const chatId = await this._messagingOperations.createChat(
      type,
      userId,
      users
    );
    //Create user chat record
    if (type === ChatTypes.SUC) {
      this._messagingOperations.joinChat(chatId, users[0]);
      this._messagingOperations.joinChat(chatId, users[1]);
    } else {
      this._messagingOperations.joinChat(chatId, userId);
    }
    return chatId;
  }

  /**
   * Join to chat, create chat user record
   *
   * @param joinChat join chat param object - userId, chatId, temp flag
   */
  async joinChat(joinChatDto: JoinChatDTO): Promise<void> {
    return this._messagingOperations.joinChat(
      joinChatDto.chatId,
      joinChatDto.userId,
      joinChatDto.temp
    );
  }

  /**
   * Join to chat, create chat user record
   *
   * @param joinChat join chat param object - userId, chatId, temp flag
   */
  async blockChat(blockChatDto: BlockChatDTO): Promise<void> {
    const chat = await this._messagingOperations.loadChatById(
      blockChatDto.chatId
    );

    if (chat?.type !== ChatTypes.SUC) {
      logger.error('Only SUC chat could be blocked.');
      throw new Error('Only SUC chat could be blocked.');
    }

    if (chat.users?.includes(blockChatDto.userId)) {
      const { chatId, userId, block } = blockChatDto;
      return this._messagingOperations.blockChat(chatId, userId, block);
    } else {
      logger.error('User is not an chat participant.');
      throw new Error('User is not an chat participant.');
    }
  }

  /**
   * Leave chat, create chat user record
   *
   * @param leaveChat leave chat param object - userId, chatId
   */
  async leaveChat(leaveChatDto: LeaveChatDTO): Promise<void> {
    return this._messagingOperations.leaveChat(
      leaveChatDto.chatId,
      leaveChatDto.userId
    );
  }

  /**
   * Load inactive chats based on oldernes entity and number.
   * For example, if it is needed to load all chats which had no messages for past 2 days,
   * @old will be 2 and @timeEntity will be days.
   *
   * @param old number of entity olderness
   * @param timeEntity entity of time - days, months, minutes, weeks, seconds
   */
  async loadInactiveChats(
    old: number,
    timeEntity: TimeEntity
  ): Promise<string[]> {
    const fromTimestamp = moment()
      .subtract(old, timeEntity)
      .utc()
      .toDate()
      .getTime();

    return this._messagingOperations.loadInactiveChats(fromTimestamp);
  }

  /**
   * Delete chats and related entities - messages, chat users, chats
   *
   * @param chatIds chat ids array to delete
   */
  async deleteChats(chatIds: string[]): Promise<void> {
    try {
      const deletePromises = chatIds.map(async (chatId) => {
        return await this._messagingOperations.deleteChat(chatId);
      });
      await Promise.all(deletePromises);
    } catch (err) {
      throw new Error(err);
    }
  }
}
