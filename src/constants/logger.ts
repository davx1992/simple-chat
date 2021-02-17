import winston from "winston";
import * as path from "path";
const log_root = path.resolve(process.cwd()) + "/logs/";

const { format } = winston;
const { combine, timestamp, label, printf } = format;

const customFormat = printf(({ level, message, label, timestamp }) => {
  return `${timestamp} [${label}] ${level}: ${message}`;
});

export const logger = winston.createLogger({
  format: combine(
    winston.format.colorize(),
    label({ label: "SIMPLE_CHAT" }),
    timestamp(),
    customFormat
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({
      filename: log_root + "error.log",
      level: "error",
    }),
  ],
});
