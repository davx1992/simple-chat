import {
  controller,
  httpGet,
  httpPost,
  queryParam,
  request,
  response,
} from 'inversify-express-utils';
import * as express from 'express';
import { ValidateBody, ValidateQuery } from '../decorators/validate.decorator';
import {
  BlockChatDTO,
  DeleteChatsDTO,
  JoinChatDTO,
  LeaveChatDTO,
  LoadInactiveChatListDTO,
  NewChatDTO,
  TimeEntity,
} from '../interfaces/api.interface';
import SERVICE_IDENTIFIER from '../constants/identifiers';
import { inject } from 'inversify';
import { ChatTypes } from '../interfaces/messaging.interface';
import { logger } from '../constants/logger';
import { ApiService } from '../services/api';

@controller('/api')
export default class ApiController {
  constructor(
    @inject(SERVICE_IDENTIFIER.API)
    private _apiService: ApiService
  ) {}

  /**
   * Create chat request of API. Request will be validated against type of NewChatDTO
   * @example
   * {
   *    userId: string,
   *    type: ChatTypes,
   *    users?: string[]
   * }
   * @param req express request object
   * @param res express response object
   */
  @httpPost('/chat/create')
  @ValidateBody(NewChatDTO)
  private async createChat(
    @request() req: express.Request,
    @response() res: express.Response
  ): Promise<string> {
    const newChat: NewChatDTO = req.body;
    const { type, userId, users } = newChat;

    //Validate if users provided for SUC chat are two unique and if there is two users
    if (type === ChatTypes.SUC) {
      if (users.length === 2) {
        //Validate user list if it is having two people and one of them is sender
        const receipient = users.find((user) => user !== userId);
        if (!receipient) {
          logger.error('User list should contain creator and receipient');
          res.status(400).json({
            error: 'User list should contain creator and receipient',
          });
          return;
        }
      } else {
        logger.error('Only two users should be provided for SUC chat');
        res.status(400).json({
          error: 'Only two users should be provided for SUC chat',
        });
        return;
      }
    }

    try {
      const chatId = await this._apiService.createChat(newChat);
      res.status(200).send(chatId);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }

  /**
   * Join to the chat, Request will be validated against type of JoinChatDTO
   * @example
   * {
   *    userId: string,
   *    chatId: string,
   *    temp?: ChatTypes,
   * }
   *
   * @param req express request object
   * @param res express response object
   */
  @httpPost('/chat/join')
  @ValidateBody(JoinChatDTO)
  private async joinChat(
    @request() req: express.Request,
    @response() res: express.Response
  ): Promise<void> {
    try {
      const joinChat: JoinChatDTO = req.body;
      await this._apiService.joinChat(joinChat);
      res.status(200).send();
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }

  /**
   * Join to the chat, Request will be validated against type of JoinChatDTO
   * @example
   * {
   *    userId: string,
   *    chatId: string,
   * }
   *
   * @param req express request object
   * @param res express response object
   */
  @httpPost('/chat/leave')
  @ValidateBody(LeaveChatDTO)
  private async leaveChat(
    @request() req: express.Request,
    @response() res: express.Response
  ): Promise<void> {
    try {
      const leaveChat: LeaveChatDTO = req.body;
      await this._apiService.leaveChat(leaveChat);
      res.status(200).send();
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }

  /**
   * Load inactive chats based on oldernes entity and number.
   * For example, if it is needed to load all chats which had no messages for past 2 days,
   * @old will be 2 and @timeEntity will be days.
   *
   * @param old how long time inactive chats to load
   * @param timeEntity entity of time - days, months, minutes, weeks, seconds
   * @param res express response object
   */
  @httpGet('/chat/inactive')
  @ValidateQuery(LoadInactiveChatListDTO)
  private async loadInactiveChats(
    @queryParam('old') old: number,
    @queryParam('entity') timeEntity: TimeEntity,
    @response() res: express.Response
  ): Promise<string[]> {
    try {
      return this._apiService.loadInactiveChats(old, timeEntity);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }

  @httpPost('/chat/delete')
  @ValidateBody(DeleteChatsDTO)
  private async deleteChats(
    @request() req: express.Request,
    @response() res: express.Response
  ): Promise<void> {
    try {
      const deleteChats: DeleteChatsDTO = req.body;
      await this._apiService.deleteChats(deleteChats.chatIds);
      res.status(200).send();
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }

  @httpPost('/chat/block')
  @ValidateBody(BlockChatDTO)
  private async blockChat(
    @request() req: express.Request,
    @response() res: express.Response
  ): Promise<void> {
    try {
      const blockChat: BlockChatDTO = req.body;
      await this._apiService.blockChat(blockChat);
      res.status(200).send();
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }
}
