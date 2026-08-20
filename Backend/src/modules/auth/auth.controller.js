import * as authService from "./auth.service.js";
import ApiResponse from "../../common/utils/ApiResponse.js";

export const register = async (req, res) => {
  const result = await authService.registerUser(req.body);
  new ApiResponse(201, "User registered successfully", result).send(res);
};

export const login = async (req, res) => {
  const result = await authService.loginUser(req.body);
  new ApiResponse(200, "Login successful", result).send(res);
};
