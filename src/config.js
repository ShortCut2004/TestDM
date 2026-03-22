import dotenv from 'dotenv';
dotenv.config();

export function loadConfig() {
  const required = ['OPENROUTER_API_KEY'];
  const missing = required.filter(k => !process.env[k]);
  if (missing.length) {
    console.warn(`⚠ Missing env vars: ${missing.join(', ')} - some features will be unavailable`);
  }

  const cfg = {
    port: parseInt(process.env.PORT || '3000', 10),
    verifyToken: process.env.VERIFY_TOKEN || 'default-verify-token',
    apiSecret: process.env.API_SECRET || 'default-secret',
    openrouterApiKey: process.env.OPENROUTER_API_KEY || '',
    aiModel: process.env.AI_MODEL || 'anthropic/claude-sonnet-4.5',
    // AI microservice (Python) integration
    aiMicroserviceEnabled: process.env.AI_MICROSERVICE_ENABLED === 'true',
    aiServiceUrl: process.env.AI_SERVICE_URL || 'http://localhost:8000',
    fbAppId: process.env.FB_APP_ID || '',
    fbAppSecret: process.env.FB_APP_SECRET || '',
    igAppId: process.env.IG_APP_ID || process.env.FB_APP_ID || '',
    igAppSecret: process.env.IG_APP_SECRET || process.env.FB_APP_SECRET || '',
    baseUrl: process.env.BASE_URL || `http://localhost:${process.env.PORT || 3000}`,
    sessionSecret: process.env.SESSION_SECRET || 'default-session-secret',
    adminEmail: process.env.ADMIN_EMAIL || '',
    openaiApiKey: process.env.OPENAI_API_KEY || '',
    // Polar billing
    polarAccessToken: process.env.POLAR_ACCESS_TOKEN || '',
    polarWebhookSecret: process.env.POLAR_WEBHOOK_SECRET || '',
    polarOrganizationId: process.env.POLAR_ORGANIZATION_ID || '',
    polarProductId: process.env.POLAR_PRODUCT_ID || '',
    trialDays: parseInt(process.env.TRIAL_DAYS || '14', 10),
    defaultMonthlyPrice: parseInt(process.env.DEFAULT_MONTHLY_PRICE || '12500', 10), // cents ($125)
    // Self-learning system (kill switches)
    learningEnabled: process.env.LEARNING_ENABLED !== 'false', // default: ON
    gradingEnabled: process.env.GRADING_ENABLED !== 'false',
    goldenInjectionEnabled: process.env.GOLDEN_INJECTION_ENABLED !== 'false',
    promptVersion: process.env.PROMPT_VERSION || 'v1',
  };

  // SECURITY: Crash in production if critical secrets are missing or set to defaults
  // Detect production by RAILWAY_ENVIRONMENT or NODE_ENV (not BASE_URL, which is also set locally)
  const isProduction = process.env.RAILWAY_ENVIRONMENT || process.env.NODE_ENV === 'production';
  if (isProduction) {
    const criticalSecrets = ['API_SECRET', 'SESSION_SECRET', 'VERIFY_TOKEN'];
    const missingSec = criticalSecrets.filter(k => !process.env[k]);
    if (missingSec.length) {
      console.error(`FATAL: Missing critical secrets in production: ${missingSec.join(', ')}`);
      process.exit(1);
    }
    if (cfg.apiSecret === 'default-secret' || cfg.sessionSecret === 'default-session-secret') {
      console.error('FATAL: Cannot use default secrets in production');
      process.exit(1);
    }
  }

  return cfg;
}

export const config = loadConfig();
