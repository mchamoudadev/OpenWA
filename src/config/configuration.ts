export default () => ({
  port: parseInt(process.env.PORT || '2785', 10),

  // Redis configuration
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD,
  },

  // Queue configuration
  queue: {
    enabled: process.env.QUEUE_ENABLED === 'true',
  },

  // Cache configuration
  cache: {
    enabled: process.env.CACHE_ENABLED === 'true',
  },

  // Main Database configuration (always SQLite for boot config)
  database: {
    type: 'sqlite' as const,
    database: './data/main.sqlite',
    synchronize: true,
    logging: process.env.DATABASE_LOGGING === 'true',
  },

  // Data Storage Database configuration (pluggable: SQLite, PostgreSQL, etc.)
  dataDatabase: {
    type: process.env.DATABASE_TYPE || 'sqlite',
    // SQLite path (used when type is sqlite)
    database: process.env.DATABASE_NAME || './data/openwa.sqlite',
    // PostgreSQL/MySQL connection (used when type is postgres/mysql)
    host: process.env.DATABASE_HOST || 'localhost',
    port: parseInt(process.env.DATABASE_PORT || '5432', 10),
    username: process.env.DATABASE_USERNAME,
    password: process.env.DATABASE_PASSWORD,
    synchronize: process.env.DATABASE_SYNCHRONIZE === 'true',
    logging: process.env.DATABASE_LOGGING === 'true',
    // Connection pooling (PostgreSQL)
    poolSize: parseInt(process.env.DATABASE_POOL_SIZE || '10', 10),
    // SSL configuration
    ssl: process.env.DATABASE_SSL === 'true',
    sslRejectUnauthorized: process.env.DATABASE_SSL_REJECT_UNAUTHORIZED !== 'false',
  },

  // WhatsApp engine configuration
  engine: {
    type: process.env.ENGINE_TYPE || 'whatsapp-web.js',
    puppeteer: {
      headless: process.env.PUPPETEER_HEADLESS !== 'false',
      args: (process.env.PUPPETEER_ARGS || '--no-sandbox,--disable-setuid-sandbox').split(','),
    },
    sessionDataPath: process.env.SESSION_DATA_PATH || './data/sessions',
  },

  // Webhook configuration
  webhook: {
    timeout: parseInt(process.env.WEBHOOK_TIMEOUT || '10000', 10),
    maxRetries: parseInt(process.env.WEBHOOK_MAX_RETRIES || '3', 10),
    retryDelay: parseInt(process.env.WEBHOOK_RETRY_DELAY || '5000', 10),
  },

  // API configuration
  api: {
    rateLimit: {
      // Short burst protection: 10 requests per second
      shortTtl: parseInt(process.env.RATE_LIMIT_SHORT_TTL || '1000', 10),
      shortLimit: parseInt(process.env.RATE_LIMIT_SHORT_LIMIT || '10', 10),
      // Medium protection: 100 requests per minute
      mediumTtl: parseInt(process.env.RATE_LIMIT_MEDIUM_TTL || '60000', 10),
      mediumLimit: parseInt(process.env.RATE_LIMIT_MEDIUM_LIMIT || '100', 10),
      // Long protection: 1000 requests per hour
      longTtl: parseInt(process.env.RATE_LIMIT_LONG_TTL || '3600000', 10),
      longLimit: parseInt(process.env.RATE_LIMIT_LONG_LIMIT || '1000', 10),
    },
  },

  // Caawiye platform integration (P3-T1). Thin, opt-in bridge to the Caawiye
  // AI platform. Inbound: forward WA messages to the platform webhook (HMAC).
  // Outbound reuses the standard send API. Session-at-rest encryption + a
  // canary/health concept for the whatsapp-web.js-breaks-periodically risk.
  caawiye: {
    // Master switch for the inbound forwarder. Off by default so the fork's
    // stock behaviour is unchanged unless a Caawiye deploy opts in.
    enabled: process.env.CAAWIYE_ENABLED === 'true',
    // Platform webhook that receives inbound messages (HMAC-signed).
    webhookUrl: process.env.CAAWIYE_WEBHOOK_URL,
    // Shared HMAC secret (same value as the platform's WA_WEBHOOK_SECRET).
    webhookSecret: process.env.WA_WEBHOOK_SECRET,
    webhookTimeoutMs: parseInt(process.env.CAAWIYE_WEBHOOK_TIMEOUT_MS || '10000', 10),
    // AES-256-GCM key for session-at-rest encryption (hex or passphrase). When
    // absent, the session vault is inert and LocalAuth behaves as stock.
    sessionKey: process.env.WA_SESSION_KEY,
    // Optional canary session name to watch for early breakage warning (P3-T4).
    canarySession: process.env.CAAWIYE_CANARY_SESSION,
  },

  // Storage configuration
  storage: {
    type: process.env.STORAGE_TYPE || 'local',
    localPath: process.env.STORAGE_LOCAL_PATH || './data/media',
    s3: {
      bucket: process.env.S3_BUCKET,
      region: process.env.S3_REGION,
      accessKeyId: process.env.S3_ACCESS_KEY_ID,
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
      endpoint: process.env.S3_ENDPOINT,
    },
  },
});
