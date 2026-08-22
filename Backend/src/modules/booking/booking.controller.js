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

export const cancelBookingAsOwner = async (req, res) => {
  const booking = await bookingService.cancelBookingAsOwner(
    req.user,
    req.params.id,
    req.body.reason
  );
  new ApiResponse(200, "Booking cancelled successfully", booking).send(res);
};

export const markBookingRefunded = async (req, res) => {
  const booking = await bookingService.markBookingRefunded(req.user, req.params.id);
  new ApiResponse(200, "Booking marked as refunded", booking).send(res);
};

export const createManualBooking = async (req, res) => {
  const bookings = await bookingService.createManualBooking(req.user._id, req.body);
  new ApiResponse(201, "Booking created", bookings).send(res);
};

export const getOwnerCustomers = async (req, res) => {
  const { page, limit } = req.query;
  const customers = await bookingService.getOwnerCustomers(req.user._id, {
    page: page ? Number(page) : undefined,
    limit: limit ? Number(limit) : undefined,
  });
  new ApiResponse(200, "Customers fetched successfully", customers).send(res);
};

export const getOwnerCustomerDetail = async (req, res) => {
  const detail = await bookingService.getOwnerCustomerDetail(req.user._id, req.params.userId);
  new ApiResponse(200, "Customer detail fetched successfully", detail).send(res);
};

export const getTurfBookings = async (req, res) => {
  const { page, limit } = req.query;
  const bookings = await bookingService.getBookingsByTurf(req.user._id, req.params.turfId, {
    page: page ? Number(page) : undefined,
    limit: limit ? Number(limit) : undefined,
  });
  new ApiResponse(200, "Turf bookings fetched successfully", bookings).send(
    res
  );
};

export const getOwnerBookings = async (req, res) => {
  const { page, limit, from, to, turfId, status } = req.query;
  const bookings = await bookingService.getOwnerBookings(req.user._id, {
    page: page ? Number(page) : undefined,
    limit: limit ? Number(limit) : undefined,
    from,
    to,
    turfId,
    status,
  });
  new ApiResponse(200, "Owner bookings fetched successfully", bookings).send(
    res
  );
};
