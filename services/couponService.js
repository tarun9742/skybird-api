const mongoose = require("mongoose");
const Course = require("../models/Course");
const Coupon = require("../models/Coupon");
const CouponUsage = require("../models/CouponUsage");
const PaymentTransaction = require("../models/PaymentTransaction");

function normalizeCode(code) {
  return String(code || "").trim().toUpperCase();
}

async function findCourse(courseId) {
  let course = await Course.findOne({ id: courseId, isActive: true });

  if (!course && mongoose.isValidObjectId(courseId)) {
    course = await Course.findById(courseId);
  }

  if (!course || !course.isActive) {
    const error = new Error("Course not found");
    error.statusCode = 404;
    throw error;
  }

  return course;
}

async function loadCoupon(code) {
  const normalized = normalizeCode(code);

  if (!normalized) {
    const error = new Error("Coupon code is required");
    error.statusCode = 400;
    throw error;
  }

  const coupon = await Coupon.findOne({
    code: normalized,
    isDeleted: false,
  });

  if (!coupon) {
    const error = new Error("Invalid coupon code");
    error.statusCode = 400;
    throw error;
  }

  if (!coupon.isActive) {
    const error = new Error("This coupon is paused");
    error.statusCode = 400;
    throw error;
  }

  const now = new Date();

  if (coupon.startsAt && now < coupon.startsAt) {
    const error = new Error("This coupon is not active yet");
    error.statusCode = 400;
    throw error;
  }

  if (coupon.expiresAt && now > coupon.expiresAt) {
    const error = new Error("This coupon has expired");
    error.statusCode = 400;
    throw error;
  }

  return coupon;
}

function calculateDiscount(coupon, originalAmount) {
  let discount = 0;

  if (coupon.discountType === "percentage") {
    discount = (originalAmount * coupon.discountValue) / 100;

    if (coupon.maxDiscount !== null && coupon.maxDiscount !== undefined) {
      discount = Math.min(discount, coupon.maxDiscount);
    }
  } else {
    discount = coupon.discountValue;
  }

  discount = Math.max(0, Math.min(discount, originalAmount));

  return {
    discountAmount: Number(discount.toFixed(2)),
    finalAmount: Number(Math.max(0, originalAmount - discount).toFixed(2)),
  };
}

async function validateCoupon({ course, userId, code }) {
  const coupon = await loadCoupon(code);
  const originalAmount = Number(course.price || 0);

  if (originalAmount < Number(coupon.minPurchase || 0)) {
    const error = new Error(
      `Minimum purchase for this coupon is ₹${Number(coupon.minPurchase).toFixed(2)}`
    );
    error.statusCode = 400;
    throw error;
  }

  const successfulTotal = await CouponUsage.countDocuments({ coupon: coupon._id });
  const successfulUser = await CouponUsage.countDocuments({
    coupon: coupon._id,
    user: userId,
  });
  const pendingTotal = await PaymentTransaction.countDocuments({
    coupon: coupon._id,
    status: "PENDING",
  });
  const pendingUser = await PaymentTransaction.countDocuments({
    coupon: coupon._id,
    user: userId,
    status: "PENDING",
  });

  if (
    coupon.usageLimit !== null &&
    successfulTotal + pendingTotal >= coupon.usageLimit
  ) {
    const error = new Error("This coupon has reached its usage limit");
    error.statusCode = 400;
    throw error;
  }

  if (
    coupon.perUserLimit !== null &&
    successfulUser + pendingUser >= coupon.perUserLimit
  ) {
    const error = new Error("You have reached the usage limit for this coupon");
    error.statusCode = 400;
    throw error;
  }

  const pricing = calculateDiscount(coupon, originalAmount);

  if (pricing.finalAmount <= 0) {
    const error = new Error("Coupon cannot make the payable amount zero");
    error.statusCode = 400;
    throw error;
  }

  return { coupon, pricing };
}

async function reserveCoupon({ couponId, usageLimit }) {
  if (usageLimit === null || usageLimit === undefined) {
    return Coupon.findOneAndUpdate(
      { _id: couponId, isActive: true, isDeleted: false },
      { $inc: { reservedCount: 1 } },
      { new: true }
    );
  }

  return Coupon.findOneAndUpdate(
    {
      _id: couponId,
      isActive: true,
      isDeleted: false,
      $expr: {
        $lt: [
          { $add: ["$usedCount", "$reservedCount"] },
          "$usageLimit",
        ],
      },
    },
    { $inc: { reservedCount: 1 } },
    { new: true }
  );
}

async function releaseCoupon(couponId) {
  if (!couponId) return;
  await Coupon.findOneAndUpdate(
    { _id: couponId, reservedCount: { $gt: 0 } },
    { $inc: { reservedCount: -1 } }
  );
}

async function consumeCoupon(couponId) {
  if (!couponId) return;
  await Coupon.findOneAndUpdate(
    { _id: couponId, reservedCount: { $gt: 0 } },
    {
      $inc: {
        reservedCount: -1,
        usedCount: 1,
      },
    }
  );
}

module.exports = {
  normalizeCode,
  findCourse,
  loadCoupon,
  validateCoupon,
  calculateDiscount,
  reserveCoupon,
  releaseCoupon,
  consumeCoupon,
};
