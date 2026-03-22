import { Polar } from '@polar-sh/sdk';
import { validateEvent, WebhookVerificationError } from '@polar-sh/sdk/webhooks';
import { config } from './config.js';

// Initialize Polar client (lazy — only when token is configured)
let polar = null;
function getPolar() {
  if (!polar && config.polarAccessToken) {
    polar = new Polar({ accessToken: config.polarAccessToken });
  }
  return polar;
}

// --- Billing Access ---

export function hasBillingAccess(tenant) {
  // Backward compat: manually-set 'paid' tenants always have access
  if (tenant.paymentStatus === 'paid') return true;
  // Trial period still active
  if (tenant.paymentStatus === 'trial' && tenant.trialEndsAt) {
    return new Date(tenant.trialEndsAt) > new Date();
  }
  return false;
}

export function trialDaysRemaining(tenant) {
  if (!tenant.trialEndsAt) return 0;
  const diff = new Date(tenant.trialEndsAt) - new Date();
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}

export function getBillingStatus(tenant, conversationsThisMonth = 0) {
  const isTrialActive = tenant.paymentStatus === 'trial' && tenant.trialEndsAt && new Date(tenant.trialEndsAt) > new Date();
  const daysLeft = trialDaysRemaining(tenant);
  const projectedCost = tenant.billingModel === 'per_conversation'
    ? conversationsThisMonth * (tenant.pricePerConversation || 0)
    : (tenant.monthlyPayment || config.defaultMonthlyPrice / 100);

  return {
    status: tenant.paymentStatus || 'unpaid',
    billingModel: tenant.billingModel || 'flat',
    trialDaysRemaining: daysLeft,
    trialActive: isTrialActive,
    monthlyPayment: tenant.monthlyPayment || config.defaultMonthlyPrice / 100,
    pricePerConversation: tenant.pricePerConversation || 0,
    conversationsThisMonth,
    projectedMonthlyCost: projectedCost,
    subscriptionActive: tenant.paymentStatus === 'paid',
    polarSubscriptionId: tenant.polarSubscriptionId || null,
    canUseBot: hasBillingAccess(tenant),
  };
}

// --- Checkout ---

export async function createCheckoutSession(tenant, userEmail) {
  const client = getPolar();
  if (!client) throw new Error('Polar not configured');

  const priceInCents = (tenant.monthlyPayment && tenant.monthlyPayment > 0)
    ? Math.round(tenant.monthlyPayment * 100)
    : config.defaultMonthlyPrice;

  const checkoutOptions = {
    products: [config.polarProductId],
    customerEmail: userEmail,
    successUrl: `${config.baseUrl}/app?billing=success`,
    metadata: { tenantId: tenant.id },
    allowTrial: true,
    trialInterval: 'day',
    trialIntervalCount: config.trialDays,
  };

  // Custom pricing: override the product price if admin set a custom amount
  if (tenant.monthlyPayment && tenant.monthlyPayment > 0) {
    checkoutOptions.prices = {
      [config.polarProductId]: [{
        amountType: 'fixed',
        priceAmount: priceInCents,
        priceCurrency: 'usd',
      }],
    };
  }

  const checkout = await client.checkouts.create(checkoutOptions);
  return checkout;
}

// --- Subscription Management ---

export async function cancelSubscription(subscriptionId) {
  const client = getPolar();
  if (!client) throw new Error('Polar not configured');

  return await client.subscriptions.update({
    id: subscriptionId,
    subscriptionUpdate: { cancelAtPeriodEnd: true },
  });
}

// --- Webhook Verification ---

export function verifyAndParseWebhook(rawBody, headers) {
  return validateEvent(rawBody, headers, config.polarWebhookSecret);
}

export { WebhookVerificationError };
