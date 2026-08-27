import path from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import express, { type Express } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { env } from './config/env.js';
import { httpLogger, requestContext } from './middleware/request-context.js';
import { errorHandler, notFoundHandler } from './middleware/error-handler.js';
import { apiRateLimiter } from './middleware/rate-limit.js';
import { healthRouter } from './modules/health/health.routes.js';
import { apiRouter } from './routes.js';
import { createLogger } from './common/logger.js';

export const API_PREFIX = '/api/v1';

const here = path.dirname(fileURLToPath(import.meta.url));
/** apps/api/dist -> apps/web/dist/web/browser */
const WEB_DIR = path.resolve(here, '../../web/dist/web/browser');

const log = createLogger('app');

/**
 * Content policy for the single-service deployment, where this process also
 * serves the Angular bundle. Helmet's default policy blocks the Google Fonts
 * stylesheet, so the sources the client actually uses are listed explicitly
 * rather than disabling CSP wholesale.
 */
const webContentSecurityPolicy = {
  directives: {
    defaultSrc: ["'self'"],
    scriptSrc: ["'self'"],
    styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
    fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
    imgSrc: ["'self'", 'data:'],
    connectSrc: ["'self'"],
    objectSrc: ["'none'"],
    frameAncestors: ["'self'"],
  },
};

export const createApp = (): Express => {
  const app = express();

  // Serving the client from this process keeps the whole system on one origin
  // and one deployable. Opt in with SERVE_WEB so local API development is
  // unaffected by whether the web bundle happens to be built.
  const serveWeb = env.serveWeb && existsSync(WEB_DIR);

  if (env.serveWeb && !serveWeb) {
    log.warn({ webDir: WEB_DIR }, 'SERVE_WEB is on but no web build was found');
  }

  // Behind a proxy the rate limiter and logs need the real client IP.
  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use(
    helmet(serveWeb ? { contentSecurityPolicy: webContentSecurityPolicy } : undefined),
  );
  app.use(
    cors({
      origin: env.corsOrigins,
      credentials: true,
      exposedHeaders: ['x-request-id'],
    }),
  );
  app.use(express.json({ limit: '256kb' }));
  app.use(express.urlencoded({ extended: true, limit: '256kb' }));
  app.use(requestContext);
  app.use(httpLogger);

  // When the client is served here, `/` belongs to the app, so the JSON service
  // index is only mounted in the API-only deployment.
  app.use(healthRouter(!serveWeb));
  app.use(API_PREFIX, apiRateLimiter, apiRouter);

  if (serveWeb) {
    // Fingerprinted assets are immutable; index.html must never be cached or
    // clients keep booting the previous release after a deploy.
    app.use(
      express.static(WEB_DIR, {
        index: false,
        maxAge: '1y',
        setHeaders: (res, filePath) => {
          if (filePath.endsWith('index.html')) {
            res.setHeader('Cache-Control', 'no-cache');
          }
        },
      }),
    );

    // Angular owns client-side routing, so anything that is not an API call
    // falls through to the app shell. Unknown /api paths still 404 as JSON.
    app.get(/^\/(?!api\/).*/, (_req, res) => {
      res.sendFile(path.join(WEB_DIR, 'index.html'));
    });

    log.info({ webDir: WEB_DIR }, 'Serving the web client from the API process');
  }

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
};
