import * as settingsService from "./settings.service.js";
import ApiResponse from "../../common/utils/ApiResponse.js";

export const getSettings = async (_req, res) => {
  const settings = await settingsService.getSettings();
  new ApiResponse(200, "Settings fetched successfully", settings).send(res);
};

export const updateCommissionRate = async (req, res) => {
  const settings = await settingsService.updateCommissionRate(req.user._id, Number(req.body.commissionRate));
  new ApiResponse(200, "Commission rate updated", settings).send(res);
};
