import * as brevo from "@getbrevo/brevo";
import env, { isBrevoConfigured } from "../../common/config/env.js";
import ApiError from "../../common/utils/ApiError.js";

let apiInstance = null;

const getClient = () => {
  if (!isBrevoConfigured()) {
    throw new ApiError(503, "Email is not configured on this server");
  }
  if (!apiInstance) {
    apiInstance = new brevo.TransactionalEmailsApi();
    apiInstance.setApiKey(brevo.TransactionalEmailsApiApiKeys.apiKey, env.BREVO_API_KEY);
  }
  return apiInstance;
};

/**
 * Sends one transactional email via Brevo. Returns the provider message id
 * on success. Throws on failure — callers (email.service.js) are responsible
 * for catching this so an email failure never propagates into a payment or
 * booking failure (Phase 20).
 */
export const sendTransactionalEmail = async ({ to, subject, html }) => {
  const client = getClient();
  const email = new brevo.SendSmtpEmail();
  email.sender = { name: env.BREVO_SENDER_NAME, email: env.BREVO_SENDER_EMAIL };
  email.to = [{ email: to }];
  email.subject = subject;
  email.htmlContent = html;

  const response = await client.sendTransacEmail(email);
  return response?.body?.messageId || response?.messageId || null;
};
