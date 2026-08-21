import * as bookingService from "./booking.service.js";
import ApiResponse from "../../common/utils/ApiResponse.js";

export const lockSlot = async (req, res) => {
  const slot = await bookingService.lockSlot(req.user._id, req.body.slotId);
  new ApiResponse(200, "Slot locked successfully", slot).send(res);
};

export const confirmSlot = async (req, res) => {
  const booking = await bookingService.confirmSlot(req.user._id, req.body.slotId);
  new ApiResponse(201, "Slot confirmed and booked successfully", booking).send(res);
};

export const bookSlot = async (req, res) => {
  const booking = await bookingService.bookSlot(req.user._id, req.body.slotId);
  new ApiResponse(201, "Slot booked successfully", booking).send(res);
};

export const bookMultipleSlots = async (req, res) => {
  const bookings = await bookingService.bookMultipleSlots(req.user._id, req.body.slotIds);
  new ApiResponse(201, "Slots booked successfully", bookings).send(res);
};

export const getMyBookings = async (req, res) => {
  const bookings = await bookingService.getUserBookings(req.user._id);
  new ApiResponse(200, "Bookings fetched successfully", bookings).send(res);
};

export const cancelBooking = async (req, res) => {
  const booking = await bookingService.cancelBooking(
    req.user._id,
    req.params.id
  );
  new ApiResponse(200, "Booking cancelled successfully", booking).send(res);
};

export const getTurfBookings = async (req, res) => {
  const bookings = await bookingService.getBookingsByTurf(req.user._id, req.params.turfId);
  new ApiResponse(200, "Turf bookings fetched successfully", bookings).send(
    res
  );
};

export const getOwnerBookings = async (req, res) => {
  const bookings = await bookingService.getOwnerBookings(req.user._id);
  new ApiResponse(200, "Owner bookings fetched successfully", bookings).send(
    res
  );
};
