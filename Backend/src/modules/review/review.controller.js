import * as reviewService from "./review.service.js";
import ApiResponse from "../../common/utils/ApiResponse.js";

export const createReview = async (req, res) => {
  const review = await reviewService.createReview(req.user._id, req.params.turfId, req.body);
  new ApiResponse(201, "Review submitted", review).send(res);
};

export const getReviewsForTurf = async (req, res) => {
  const reviews = await reviewService.getReviewsForTurf(req.params.turfId);
  new ApiResponse(200, "Reviews fetched", reviews).send(res);
};

export const canReview = async (req, res) => {
  const eligible = await reviewService.canReview(req.user._id, req.params.turfId);
  new ApiResponse(200, "Eligibility checked", { canReview: eligible }).send(res);
};
