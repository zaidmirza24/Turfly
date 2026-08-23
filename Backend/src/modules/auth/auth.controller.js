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

export const forgotPassword = async (req, res) => {
  await authService.requestPasswordReset(req.body.email);
  // Always the same response whether or not the email exists — see
  // requestPasswordReset's comment on why that must never be observable.
  new ApiResponse(200, "If an account exists for that email, a reset link has been sent").send(res);
};

export const resetPassword = async (req, res) => {
  await authService.resetPassword({
    email: req.body.email,
    token: req.body.token,
    newPassword: req.body.password,
  });
  new ApiResponse(200, "Password reset — you can now log in with your new password").send(res);
};
