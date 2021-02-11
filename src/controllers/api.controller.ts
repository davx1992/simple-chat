import {
    controller,
    httpGet,
    httpPost,
    request,
    requestParam,
} from "inversify-express-utils";
import * as express from "express";
import { ValidateBody, ValidateQuery } from "../decorators/validate.decorator";

@controller("/api")
export default class ApiController {
    @httpGet("/")
    private index(
        req: express.Request,
        res: express.Response,
        next: express.NextFunction,
    ): string {
        return "test";
    }

    @httpPost("/:id")
    private test(@request() req: express.Request) {
        console.log(req?.body);
    }
}
