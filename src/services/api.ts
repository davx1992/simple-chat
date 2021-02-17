import { inject, injectable } from "inversify";
import SERVICE_IDENTIFIER from "../constants/identifiers";
import {
  JoinChatDTO,
  LeaveChatDTO,
  NewChatDTO,
} from "../interfaces/chats.interface";
import { ChatTypes } from "../interfaces/messaging.interface";
import { MessagingOperations } from "./messaging/operations";

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
}
