"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("reflect-metadata");
var inversify_1 = require("inversify");
var identifiers_1 = __importDefault(require("./constants/identifiers"));
var app_1 = __importDefault(require("./entities/app"));
var container = new inversify_1.Container();
container.bind(identifiers_1.default.APP).to(app_1.default);
exports.default = container;
//# sourceMappingURL=container.js.map