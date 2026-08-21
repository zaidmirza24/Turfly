import * as userService from "./user.service.js";
import ApiResponse from "../../common/utils/ApiResponse.js";

export const getMe = async (req, res) => {
  const user = await userService.getMe(req.user._id);
  new ApiResponse(200, "Profile fetched", user).send(res);
};

export const updateMe = async (req, res) => {
  const user = await userService.updateMe(req.user._id, req.body);
  new ApiResponse(200, "Profile updated", user).send(res);
};

export const changePassword = async (req, res) => {
  await userService.changePassword(req.user._id, req.body.currentPassword, req.body.newPassword);
  new ApiResponse(200, "Password changed successfully", null).send(res);
};

export const deleteMe = async (req, res) => {
  await userService.deleteMe(req.user._id, req.body.password);
  new ApiResponse(200, "Account deleted", null).send(res);
};

export const getFavorites = async (req, res) => {
  const favorites = await userService.getFavorites(req.user._id);
  new ApiResponse(200, "Favorites fetched", favorites).send(res);
};

export const addFavorite = async (req, res) => {
  await userService.addFavorite(req.user._id, req.params.turfId);
  new ApiResponse(200, "Added to favorites", null).send(res);
};

export const removeFavorite = async (req, res) => {
  await userService.removeFavorite(req.user._id, req.params.turfId);
  new ApiResponse(200, "Removed from favorites", null).send(res);
};
