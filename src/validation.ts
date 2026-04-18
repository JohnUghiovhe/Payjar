import { NextFunction, Request, Response } from 'express';
import { ZodError, ZodTypeAny } from 'zod';

import { AppError } from './errors';

type Schemas = {
  body?: ZodTypeAny;
  params?: ZodTypeAny;
  query?: ZodTypeAny;
};

export const validateRequest = (schemas: Schemas) => (request: Request, _response: Response, next: NextFunction): void => {
  try {
    if (schemas.body) {
      request.body = schemas.body.parse(request.body);
    }

    if (schemas.params) {
      request.params = schemas.params.parse(request.params);
    }

    if (schemas.query) {
      request.query = schemas.query.parse(request.query);
    }

    next();
  } catch (error) {
    if (error instanceof ZodError) {
      next(new AppError(400, 'Validation failed.', error.flatten()));
      return;
    }

    next(error);
  }
};
