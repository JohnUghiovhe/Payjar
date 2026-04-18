import cors from 'cors';
import express, { NextFunction, Request, Response } from 'express';
import swaggerUi from 'swagger-ui-express';
import { z } from 'zod';

import { WalletService } from './service';
import { AppError } from './errors';
import { openApiSpec } from './swagger';
import { validateRequest } from './validation';

const walletBodySchema = z.object({
  userId: z.string().trim().min(1),
});

const walletParamSchema = z.object({
  userId: z.string().trim().min(1),
});

const depositBodySchema = z.object({
  amount: z.number().positive(),
});

const transferBodySchema = z
  .object({
    senderUserId: z.string().trim().min(1),
    recipientUserId: z.string().trim().min(1),
    amount: z.number().positive(),
  })
  .refine(data => data.senderUserId !== data.recipientUserId, {
    path: ['recipientUserId'],
    message: 'Sender and recipient must be different users.',
  });

const transactionsQuerySchema = z.object({
  userId: z.string().trim().min(1),
});

const referenceParamSchema = z.object({
  reference: z.string().trim().min(1),
});

const asyncHandler =
  (handler: (request: Request, response: Response) => Promise<Response | void>) =>
  (request: Request, response: Response, next: NextFunction) => {
    handler(request, response).catch(next);
  };

const createApp = (walletService: WalletService): express.Express => {
  const app = express();

  app.use(cors());

  app.use('/docs', swaggerUi.serve, swaggerUi.setup(openApiSpec));
  app.get('/openapi.json', (_request, response) => {
    response.json(openApiSpec);
  });

  app.get('/health', (_request, response) => {
    response.json({ status: 'ok' });
  });

  app.post(
    '/webhooks/paystack',
    express.raw({ type: 'application/json' }),
    asyncHandler(async (request, response) => {
      const signature = request.header('x-paystack-signature');
      const rawBody = Buffer.isBuffer(request.body) ? request.body : Buffer.from('');
      const verification = walletService.verifyPaystackSignature(rawBody, signature);

      if (!verification.valid) {
        throw new AppError(401, verification.reason ?? 'Invalid Paystack signature.');
      }

      const event = JSON.parse(rawBody.toString('utf8'));
      const result = await walletService.handlePaystackWebhook(event);
      return response.status(200).json(result);
    }),
  );

  app.use(express.json());

  app.post(
    '/wallets',
    validateRequest({ body: walletBodySchema }),
    asyncHandler(async (request, response) => {
      const wallet = await walletService.createWallet(String(request.body.userId));
      return response.status(201).json({ data: wallet });
    }),
  );

  app.get(
    '/wallets/:userId',
    validateRequest({ params: walletParamSchema }),
    asyncHandler(async (request, response) => {
      const wallet = await walletService.getWallet(request.params.userId);
      return response.json({ data: wallet });
    }),
  );

  app.get(
    '/wallets/:userId/ledger',
    validateRequest({ params: walletParamSchema }),
    asyncHandler(async (request, response) => {
      const entries = await walletService.getWalletLedger(request.params.userId);
      return response.json({ data: entries });
    }),
  );

  app.post(
    '/wallets/:userId/deposits',
    validateRequest({ params: walletParamSchema, body: depositBodySchema }),
    asyncHandler(async (request, response) => {
      const idempotencyKey = String(request.header('idempotency-key') ?? '').trim();
      if (!idempotencyKey) {
        throw new AppError(400, 'idempotency-key header is required.');
      }

      const result = await walletService.startDeposit({
        userId: request.params.userId,
        amount: Number(request.body.amount),
        idempotencyKey,
      });

      return response.status(201).json(result);
    }),
  );

  app.post(
    '/transfers',
    validateRequest({ body: transferBodySchema }),
    asyncHandler(async (request, response) => {
      const idempotencyKey = String(request.header('idempotency-key') ?? '').trim();
      if (!idempotencyKey) {
        throw new AppError(400, 'idempotency-key header is required.');
      }

      const result = await walletService.transfer({
        senderUserId: String(request.body.senderUserId),
        recipientUserId: String(request.body.recipientUserId),
        amount: Number(request.body.amount),
        idempotencyKey,
      });

      return response.status(201).json(result);
    }),
  );

  app.get(
    '/transactions',
    validateRequest({ query: transactionsQuerySchema }),
    asyncHandler(async (request, response) => {
      const result = await walletService.listTransactions(String(request.query.userId));
      return response.json(result);
    }),
  );

  app.get(
    '/transactions/:reference',
    validateRequest({ params: referenceParamSchema }),
    asyncHandler(async (request, response) => {
      const result = await walletService.getTransactionByReference(request.params.reference);
      return response.json({ data: result });
    }),
  );

  app.use((error: Error, _request: Request, response: Response, _next: NextFunction) => {
    if (error instanceof AppError) {
      return response.status(error.statusCode).json({ error: error.message, details: error.details });
    }

    const message = error instanceof Error ? error.message : 'An unexpected error occurred.';
    return response.status(500).json({ error: message });
  });

  return app;
};

export { createApp };