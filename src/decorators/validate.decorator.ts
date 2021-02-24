/* eslint-disable @typescript-eslint/no-explicit-any */
import { validate, ValidationError } from 'class-validator';
import { plainToClass } from 'class-transformer';
import { IncomingMessage, ServerResponse } from 'http';
import express from 'express';

function validationFactory<T>(
  metadataKey: symbol,
  model: T,
  source: 'body' | 'query'
) {
  return function (
    target: unknown,
    propertyName: string,
    descriptor: TypedPropertyDescriptor<(...args: any[]) => unknown>
  ) {
    Reflect.defineMetadata(metadataKey, model, target, propertyName);

    const method = descriptor.value;
    descriptor.value = async function (...args) {
      const model = Reflect.getOwnMetadata(metadataKey, target, propertyName);

      const incomingMessage: IncomingMessage = args.find(
        (a: unknown) => a instanceof IncomingMessage
      );
      const res: express.Response = args.find(
        (a: unknown) => a instanceof ServerResponse
      );
      const plain = incomingMessage[source];

      const errors = await validate(plainToClass(model, plain));
      if (errors.length > 0) {
        return res.status(400).json(transformValidationErrorsToJSON(errors));
      } else {
        return method.apply(this, args);
      }
    };
  };
}

export function ValidateQuery<T>(
  dto: T
): (
  target: unknown,
  propertyName: string,
  descriptor: TypedPropertyDescriptor<(...args: any[]) => unknown>
) => void {
  return validationFactory<T>(Symbol('validate-query'), dto, 'query');
}
export function ValidateBody<T>(
  dto: T
): (
  target: unknown,
  propertyName: string,
  descriptor: TypedPropertyDescriptor<(...args: any[]) => unknown>
) => void {
  return validationFactory<T>(Symbol('validate-body'), dto, 'body');
}

function transformValidationErrorsToJSON(errors: ValidationError[]) {
  return errors.reduce((p, c: ValidationError) => {
    if (!c.children || !c.children.length) {
      p[c.property] = Object.keys(c.constraints).map(
        (key) => c.constraints[key]
      );
    } else {
      p[c.property] = transformValidationErrorsToJSON(c.children);
    }
    return p;
  }, {});
}
