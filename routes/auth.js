const express = require("express");
const router = express.Router();
const {
  sendOtp,
  verifyOtp,
  adminLogin,
} = require("../controllers/authController");

// Customer OTP
router.post("/customer/send-otp", sendOtp);
router.post("/customer/verify-otp", verifyOtp);

// Admin login
router.post("/admin/login", adminLogin);

module.exports = router;
