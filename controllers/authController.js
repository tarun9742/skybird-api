const jwt = require("jsonwebtoken");
const User = require("../models/User");
const Admin = require("../models/Admin");

// In-memory OTP store (for development)
// In production use Redis or DB
const otpStore = new Map();

const generateToken = (id, role) => {
  return jwt.sign({ id, role }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRE || "7d",
  });
};

// ===================== CUSTOMER OTP =====================

// @desc    Send OTP to mobile
// @route   POST /api/auth/customer/send-otp
exports.sendOtp = async (req, res) => {
  try {
    const { mobile } = req.body;

    if (!mobile || !/^\d{10}$/.test(mobile)) {
      return res.status(400).json({
        success: false,
        message: "Please provide a valid 10-digit mobile number",
      });
    }

    // Generate 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt =
      Date.now() + (parseInt(process.env.OTP_EXPIRE_MINUTES) || 5) * 60 * 1000;

    otpStore.set(mobile, { otp, expiresAt });

    // In real app → send SMS via Twilio / MSG91 etc.

    let user = await User.findOne({ mobile });

    res.status(200).json({
      success: true,
      message: "OTP sent successfully",
      // Only for development – remove in production
      debugOtp: otp,
      existingUser: !!user,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// @desc    Verify OTP & Login / Register
// @route   POST /api/auth/customer/verify-otp
exports.verifyOtp = async (req, res) => {
  try {
    const { mobile, otp, name } = req.body;

    if (!mobile || !otp) {
      return res.status(400).json({
        success: false,
        message: "Mobile and OTP are required",
      });
    }

    const stored = otpStore.get(mobile);

    if (!stored) {
      return res.status(400).json({
        success: false,
        message: "OTP expired or not requested. Please request a new OTP.",
      });
    }

    if (Date.now() > stored.expiresAt) {
      otpStore.delete(mobile);
      return res.status(400).json({
        success: false,
        message: "OTP has expired. Please request a new one.",
      });
    }

    if (stored.otp !== otp) {
      return res.status(400).json({
        success: false,
        message: "Invalid OTP",
      });
    }

    // OTP valid → delete it
    otpStore.delete(mobile);

    // Find or create user
    let user = await User.findOne({ mobile });

    if (!user) {
      user = await User.create({
        mobile,
        name: name || "",
      });
    } else if (name && !user.name) {
      user.name = name;
      await user.save();
    }

    if (user.isBlocked) {
      return res.status(403).json({
        success: false,
        message: "Your account has been blocked. Contact support.",
      });
    }

    const token = generateToken(user._id, "customer");

    res.status(200).json({
      success: true,
      message: "Login successful",
      token,
      user: {
        id: user._id,
        mobile: user.mobile,
        name: user.name,
        role: user.role,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// ===================== ADMIN LOGIN =====================

// @desc    Admin login
// @route   POST /api/auth/admin/login
exports.adminLogin = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "Email and password are required",
      });
    }

    const admin = await Admin.findOne({ email: email.toLowerCase() });

    if (!admin) {
      return res.status(401).json({
        success: false,
        message: "Invalid credentials",
      });
    }

    const isMatch = await admin.comparePassword(password);

    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: "Invalid credentials",
      });
    }

    const token = generateToken(admin._id, "admin");

    res.status(200).json({
      success: true,
      message: "Admin login successful",
      token,
      admin: {
        id: admin._id,
        email: admin.email,
        name: admin.name,
        role: admin.role,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};
