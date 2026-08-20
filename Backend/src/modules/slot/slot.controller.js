import * as slotService from "./slot.service.js";
import ApiResponse from "../../common/utils/ApiResponse.js";

export const createSlots = async (req, res) => {
  const { turfId, slots } = req.body;
  const createdSlots = await slotService.createSlots(
    req.user._id,
    turfId,
    slots
  );
  new ApiResponse(201, "Slots created successfully", createdSlots).send(res);
};

export const getSlots = async (req, res) => {
  const { turfId, date, status, startDate, endDate } = req.query;
  const slots = await slotService.getSlotsByTurf(turfId, { date, status, startDate, endDate });
  new ApiResponse(200, "Slots fetched successfully", slots).send(res);
};

export const deleteSlots = async (req, res) => {
  const { turfId, date } = req.query;
  await slotService.deleteSlots(req.user._id, turfId, { date });
  new ApiResponse(200, "Slots cleared successfully").send(res);
};

export const updateSlots = async (req, res) => {
  const { turfId, date, price, weekdayPrice, weekendPrice } = req.body;
  await slotService.updateSlots(req.user._id, turfId, { date, price, weekdayPrice, weekendPrice });
  new ApiResponse(200, "Slots updated successfully").send(res);
};

export const setSlotsStatus = async (req, res) => {
  const { turfId, slots, status } = req.body;
  const updated = await slotService.setSlotsStatus(req.user._id, turfId, { slots, status });
  new ApiResponse(200, "Slot status updated", updated).send(res);
};
