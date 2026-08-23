import PlatformSettings from "./settings.model.js";
import env from "../../common/config/env.js";
import ApiError from "../../common/utils/ApiError.js";
import { logAdminAction } from "../admin/admin.service.js";

/**
 * The one PlatformSettings row, created lazily on first read/write with
 * env.PLATFORM_COMMISSION_RATE as the seed value. Avoids a startup seed
 * script for a document that's otherwise just a single mutable number.
 */
const getOrCreateSettings = async () => {
  let settings = await PlatformSettings.findOne();
  if (!settings) {
    settings = await PlatformSettings.create({ commissionRate: env.PLATFORM_COMMISSION_RATE });
  }
  return settings;
};

/**
 * The live commission rate, consulted by payment.service.js's
 * computeCommissionSplit on every ONLINE booking confirmation.
 */
export const getCommissionRate = async () => {
  const settings = await getOrCreateSettings();
  return settings.commissionRate;
};

export const getSettings = async () => {
  const settings = await getOrCreateSettings();
  return { commissionRate: settings.commissionRate, updatedAt: settings.updatedAt };
};

export const updateCommissionRate = async (adminId, rate) => {
  if (typeof rate !== "number" || Number.isNaN(rate) || rate < 0 || rate >= 1) {
    throw new ApiError(400, "Commission rate must be a number between 0 (inclusive) and 1 (exclusive)");
  }

  const settings = await getOrCreateSettings();
  settings.commissionRate = rate;
  settings.updatedBy = adminId;
  await settings.save();

  await logAdminAction(adminId, "COMMISSION_RATE_UPDATED", "PLATFORM_SETTINGS", settings._id, { commissionRate: rate });
  return { commissionRate: settings.commissionRate, updatedAt: settings.updatedAt };
};
