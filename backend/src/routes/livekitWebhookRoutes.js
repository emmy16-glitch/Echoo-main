import express from 'express';
import { WebhookReceiver } from 'livekit-server-sdk';
import { env } from '../config/env.js';

const router = express.Router();

router.post('/', async (req, res) => {
  if (!env.livekitApiKey || !env.livekitApiSecret) {
    return res.status(503).json({
      error: {
        code: 'LIVEKIT_WEBHOOK_NOT_CONFIGURED',
        message: 'LiveKit webhook verification is not configured.',
      },
    });
  }

  const body = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : '';
  const authorization = req.get('Authorization');

  if (!body || !authorization) {
    return res.status(401).json({
      error: {
        code: 'INVALID_LIVEKIT_WEBHOOK',
        message: 'A signed LiveKit webhook payload is required.',
      },
    });
  }

  try {
    const receiver = new WebhookReceiver(env.livekitApiKey, env.livekitApiSecret);
    const event = await receiver.receive(body, authorization);

    // Signature verification is deliberately completed before any event is
    // trusted. Event-specific state updates can be added here as needed.
    return res.status(200).json({
      data: {
        received: true,
        event: event.event || null,
      },
    });
  } catch (error) {
    console.warn('Rejected LiveKit webhook:', error?.message || error);
    return res.status(401).json({
      error: {
        code: 'INVALID_LIVEKIT_WEBHOOK',
        message: 'LiveKit webhook signature verification failed.',
      },
    });
  }
});

export default router;
