import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { randomUUID } from 'node:crypto';
import { HEALTH_PATH, MAX_BODY_BYTES } from '@studylens/shared';
import type { HealthResponse } from '@studylens/shared';
import { loadDotenv, loadConfig, describeConfig, ConfigError } from './config/env';
import type { AppConfig } from './config/env';
import { createProvider } from './ai/provider.factory';
import { registerProcessRoute, sendError } from './routes/process';

loadDotenv();

let config: AppConfig;
try {
  config = loadConfig();
} catch (e) {
  if (e instanceof ConfigError) {
    console.error(`[StudyLens] Configuration error: ${e.message}`);
    process.exit(1);
  }
  throw e;
}

const provider = createProvider(config);
console.log('[StudyLens] Configuration:', JSON.stringify(describeConfig(config)));
console.log(`[StudyLens] AI provider: ${provider.name} (${provider.model})`);

const app = express();
app.disable('x-powered-by');

app.use(
  cors({
    origin(origin, callback) {
      if (!origin) return callback(null, true);
      if (origin.startsWith('chrome-extension://')) return callback(null, true);
      if (config.allowedOrigins.includes(origin)) return callback(null, true);
      return callback(new Error('ORIGIN_NOT_ALLOWED'));
    },
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type', 'X-Request-Id'],
  })
);

app.use(express.json({ limit: MAX_BODY_BYTES }));

// Metadata-only logging. Never logs req.body, source text, or model output.
app.use((req: Request, res: Response, next: NextFunction) => {
  const started = Date.now();
  const requestId = (req.header('x-request-id') ?? randomUUID()).slice(0, 64);
  res.locals.requestId = requestId;
  res.setHeader('X-Request-Id', requestId);
  res.on('finish', () => {
    console.log(JSON.stringify({
      requestId, method: req.method, route: req.path,
      status: res.statusCode, latencyMs: Date.now() - started,
    }));
  });
  next();
});

app.get(HEALTH_PATH, (_req: Request, res: Response) => {
  const body: HealthResponse = {
    status: 'ok', service: 'studylens-backend', version: '2.0.0',
    timestamp: new Date().toISOString(),
  };
  res.status(200).json(body);
});

// Safe diagnostic: describeConfig() emits no secret material.
app.get('/api/v1/config', (_req: Request, res: Response) => {
  res.status(200).json(describeConfig(config));
});

registerProcessRoute(app, provider);

app.use((_req: Request, res: Response) => {
  sendError(res, 'INVALID_INPUT', 'Unknown route.', String(res.locals.requestId ?? ''));
});

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  const requestId = String(res.locals.requestId ?? '');
  if (err.message === 'ORIGIN_NOT_ALLOWED') {
    sendError(res, 'INVALID_INPUT', 'Origin not allowed.', requestId);
    return;
  }
  if ((err as { type?: string }).type === 'entity.too.large') {
    sendError(res, 'TEXT_TOO_LONG', 'Request body exceeds the size limit.', requestId);
    return;
  }
  if (err instanceof SyntaxError) {
    sendError(res, 'INVALID_INPUT', 'Request body is not valid JSON.', requestId);
    return;
  }
  console.error(JSON.stringify({ requestId, errorCode: 'INTERNAL_ERROR' }));
  sendError(res, 'INTERNAL_ERROR', 'Unexpected server error.', requestId);
});

app.listen(config.port, config.host, () => {
  console.log(`StudyLens backend listening on http://${config.host}:${config.port} (env=${config.nodeEnv})`);
  console.log(`Health check: curl http://localhost:${config.port}${HEALTH_PATH}`);
  console.log(`Config check: curl http://localhost:${config.port}/api/v1/config`);
});