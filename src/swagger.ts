export const openApiSpec = {
  openapi: '3.0.3',
  info: {
    title: 'PayFlow API',
    version: '1.0.0',
    description:
      'Backend-driven wallet and transaction management API with PostgreSQL persistence, idempotency keys, and Paystack webhook verification.',
  },
  servers: [{ url: 'http://localhost:3000' }],
  components: {
    securitySchemes: {
      IdempotencyHeader: {
        type: 'apiKey',
        in: 'header',
        name: 'idempotency-key',
      },
    },
    schemas: {
      Wallet: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          userId: { type: 'string' },
          currency: { type: 'string', example: 'NGN' },
          balance: { type: 'number' },
          status: { type: 'string' },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' },
        },
      },
      Transaction: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          reference: { type: 'string' },
          type: { type: 'string', enum: ['deposit', 'transfer'] },
          status: { type: 'string', enum: ['pending', 'completed', 'failed', 'reversed'] },
          amount: { type: 'number' },
          fromWalletId: { type: 'string', nullable: true },
          toWalletId: { type: 'string', nullable: true },
          userId: { type: 'string' },
          metadata: { type: 'object' },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' },
        },
      },
    },
  },
  paths: {
    '/health': {
      get: {
        summary: 'Health check',
        responses: {
          '200': {
            description: 'Service is healthy',
          },
        },
      },
    },
    '/wallets': {
      post: {
        summary: 'Create wallet for a user',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['userId'],
                properties: {
                  userId: { type: 'string' },
                },
              },
            },
          },
        },
        responses: {
          '201': {
            description: 'Wallet created or returned',
          },
        },
      },
    },
    '/wallets/{userId}': {
      get: {
        summary: 'Get wallet by user ID',
        parameters: [
          {
            name: 'userId',
            in: 'path',
            required: true,
            schema: { type: 'string' },
          },
        ],
        responses: {
          '200': { description: 'Wallet found' },
          '404': { description: 'Wallet not found' },
        },
      },
    },
    '/wallets/{userId}/ledger': {
      get: {
        summary: 'Get wallet ledger entries',
        parameters: [
          {
            name: 'userId',
            in: 'path',
            required: true,
            schema: { type: 'string' },
          },
        ],
        responses: {
          '200': { description: 'Ledger entries found' },
          '404': { description: 'Wallet not found' },
        },
      },
    },
    '/wallets/{userId}/deposits': {
      post: {
        summary: 'Create deposit intent',
        security: [{ IdempotencyHeader: [] }],
        parameters: [
          {
            name: 'userId',
            in: 'path',
            required: true,
            schema: { type: 'string' },
          },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['amount'],
                properties: {
                  amount: { type: 'number', minimum: 0.01 },
                },
              },
            },
          },
        },
        responses: {
          '201': { description: 'Deposit intent created' },
          '409': { description: 'Idempotency conflict' },
        },
      },
    },
    '/transfers': {
      post: {
        summary: 'Transfer funds between users',
        security: [{ IdempotencyHeader: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['senderUserId', 'recipientUserId', 'amount'],
                properties: {
                  senderUserId: { type: 'string' },
                  recipientUserId: { type: 'string' },
                  amount: { type: 'number', minimum: 0.01 },
                },
              },
            },
          },
        },
        responses: {
          '201': { description: 'Transfer completed' },
          '400': { description: 'Bad request' },
          '409': { description: 'Idempotency conflict' },
        },
      },
    },
    '/transactions': {
      get: {
        summary: 'Get transactions by user',
        parameters: [
          {
            name: 'userId',
            in: 'query',
            required: true,
            schema: { type: 'string' },
          },
        ],
        responses: {
          '200': { description: 'Transactions found' },
        },
      },
    },
    '/transactions/{reference}': {
      get: {
        summary: 'Get transaction by reference',
        parameters: [
          {
            name: 'reference',
            in: 'path',
            required: true,
            schema: { type: 'string' },
          },
        ],
        responses: {
          '200': { description: 'Transaction found' },
          '404': { description: 'Transaction not found' },
        },
      },
    },
    '/webhooks/paystack': {
      post: {
        summary: 'Handle Paystack webhook',
        responses: {
          '200': { description: 'Webhook accepted' },
          '401': { description: 'Invalid webhook signature' },
        },
      },
    },
  },
};
