import * as reviewService from "./review.service.js";
import ApiResponse from "../../common/utils/ApiResponse.js";
import { parsePagination } from "../../common/utils/pagination.js";

export const createReview = async (req, res) => {
  const review = await reviewService.createReview(req.user._id, req.params.turfId, req.body);
  new ApiResponse(201, "Review submitted", review).send(res);
};

export const updateReview = async (req, res) => {
  const review = await reviewService.updateReview(req.user._id, req.params.reviewId, req.body);
  new ApiResponse(200, "Review updated", review).send(res);
};

export const reportReview = async (req, res) => {
  await reviewService.reportReview(req.user._id, req.params.reviewId);
  new ApiResponse(200, "Review reported — our team will take a look", null).send(res);
};

export const respondToReview = async (req, res) => {
  const review = await reviewService.respondToReview(req.user._id, req.params.reviewId, req.body.text);
  new ApiResponse(200, "Response posted", review).send(res);
};

export const getReviewsForTurf = async (req, res) => {
  const { page, limit } = parsePagination(req.query, { defaultLimit: 10 });
  const reviews = await reviewService.getReviewsForTurf(req.params.turfId, { page, limit });
  new ApiResponse(200, "Reviews fetched", reviews).send(res);
};

export const canReview = async (req, res) => {
  const eligible = await reviewService.canReview(req.user._id, req.params.turfId);
  new ApiResponse(200, "Eligibility checked", { canReview: eligible }).send(res);
};
