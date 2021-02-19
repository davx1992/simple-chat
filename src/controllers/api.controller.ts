import {
  controller,
  httpGet,
  httpPost,
  request,
  requestParam,
  response,
} from "inversify-express-utils";
import * as express from "express";
import { ValidateBody, ValidateQuery } from "../decorators/validate.decorator";
import {
  JoinChatDTO,
  LeaveChatDTO,
  NewChatDTO,
} from "../interfaces/chats.interface";
import SERVICE_IDENTIFIER from "../constants/identifiers";
import { inject } from "inversify";
import { ChatTypes } from "../interfaces/messaging.interface";
import { logger } from "../constants/logger";
import { ApiService } from "../services/api";

@controller("/api")
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
  @httpPost("/chat/create")
  @ValidateBody(NewChatDTO)
  private async createChat(
    @request() req: express.Request,
    @response() res: express.Response
  ) {
    const newChat: NewChatDTO = req.body;
    const { type, userId, users } = newChat;

    //Validate if users provided for SUC chat are two unique and if there is two users
    if (type === ChatTypes.SUC) {
      if (users.length === 2) {
        //Validate user list if it is having two people and one of them is sender
        const receipient = users.find((user) => user !== userId);
        if (!receipient) {
          logger.error("User list should contain creator and receipient");
          res.status(400).json({
            error: "User list should contain creator and receipient",
          });
          return;
        }
      } else {
        logger.error("Only two users should be provided for SUC chat");
        res.status(400).json({
          error: "Only two users should be provided for SUC chat",
        });
        return;
      }
    }

    try {
      const chatId = await this._apiService.createChat(newChat);
      res.status(200).send(chatId);
    } catch (err) {
      res.status(500).json({ error: err });
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
  @httpPost("/chat/join")
  @ValidateBody(JoinChatDTO)
  private async joinChat(
    @request() req: express.Request,
    @response() res: express.Response
  ) {
    try {
      const joinChat: JoinChatDTO = req.body;
      await this._apiService.joinChat(joinChat);
      res.status(200);
    } catch (err) {
      res.status(500).json({ error: err });
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
  @httpPost("/chat/leave")
  @ValidateBody(LeaveChatDTO)
  private async leaveChat(
    @request() req: express.Request,
    @response() res: express.Response
  ) {
    try {
      const leaveChat: LeaveChatDTO = req.body;
      await this._apiService.leaveChat(leaveChat);
      res.status(200);
    } catch (err) {
      res.status(500).json({ error: err });
    }
  }

  @httpGet("/users/active")
  private async loadActiveUsers() {
    return this._apiService.loadActiveUsers();
  }
}
