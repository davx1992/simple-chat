"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
var identifiers_1 = __importDefault(require("./constants/identifiers"));
var container_1 = __importDefault(require("./container"));
var app = container_1.default.get(identifiers_1.default.APP);
app.init();
//# sourceMappingURL=index.js.map