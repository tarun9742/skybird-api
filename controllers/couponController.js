const Coupon = require("../models/Coupon");
const CouponUsage = require("../models/CouponUsage");
const { findCourse, normalizeCode, validateCoupon } = require("../services/couponService");

function nullableNumber(value) {
  if (value === "" || value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}
function nullableDate(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}
function validatePayload(body) {
  const code = normalizeCode(body.code);
  const type = body.discountType;
  const value = Number(body.discountValue);
  if (!code) throw new Error("Coupon code is required");
  if (!["fixed", "percentage"].includes(type)) throw new Error("Discount type must be fixed or percentage");
  if (!Number.isFinite(value) || value <= 0) throw new Error("Discount value must be greater than zero");
  if (type === "percentage" && value > 100) throw new Error("Percentage discount cannot exceed 100");
  if (body.startsAt && body.expiresAt) {
    const start = new Date(body.startsAt), end = new Date(body.expiresAt);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) throw new Error("Expiry must be later than start date");
  }
}
function buildData(body) {
  return {
    code: normalizeCode(body.code),
    discountType: body.discountType,
    discountValue: Number(body.discountValue),
    minPurchase: Number(body.minPurchase || 0),
    maxDiscount: nullableNumber(body.maxDiscount),
    usageLimit: nullableNumber(body.usageLimit),
    perUserLimit: nullableNumber(body.perUserLimit),
    startsAt: nullableDate(body.startsAt),
    expiresAt: nullableDate(body.expiresAt),
    ...(body.isActive !== undefined ? { isActive: Boolean(body.isActive) } : {}),
  };
}
exports.validateCoupon = async (req, res) => {
  try {
    const { courseId, couponCode } = req.body;
    const course = await findCourse(courseId);
    const { coupon, pricing } = await validateCoupon({ course, userId: req.user._id, code: couponCode });
    res.json({ success: true, data: { coupon: { code: coupon.code, discountType: coupon.discountType, discountValue: coupon.discountValue, maxDiscount: coupon.maxDiscount }, pricing: { originalAmount: Number(course.price), discountAmount: pricing.discountAmount, finalAmount: pricing.finalAmount } } });
  } catch (error) {
    res.status(error.statusCode || 500).json({ success: false, message: error.message || "Coupon validation failed" });
  }
};
exports.getCoupons = async (req, res) => {
  try {
    const coupons = await Coupon.find({ isDeleted: false }).sort({ createdAt: -1 }).lean();
    const data = await Promise.all(coupons.map(async coupon => ({ ...coupon, usageRecords: await CouponUsage.countDocuments({ coupon: coupon._id }) })));
    res.json({ success: true, count: data.length, data });
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
};
exports.createCoupon = async (req, res) => {
  try {
    validatePayload(req.body);
    const data = buildData(req.body);
    const exists = await Coupon.findOne({ code: data.code });
    if (exists) return res.status(400).json({ success: false, message: "Coupon code already exists" });
    const coupon = await Coupon.create(data);
    res.status(201).json({ success: true, message: "Coupon created", data: coupon });
  } catch (error) { res.status(400).json({ success: false, message: error.message }); }
};
exports.updateCoupon = async (req, res) => {
  try {
    validatePayload(req.body);
    const data = buildData(req.body);
    const exists = await Coupon.findOne({ code: data.code, _id: { $ne: req.params.id } });
    if (exists) return res.status(400).json({ success: false, message: "Coupon code already exists" });
    const coupon = await Coupon.findOneAndUpdate({ _id: req.params.id, isDeleted: false }, data, { new: true, runValidators: true });
    if (!coupon) return res.status(404).json({ success: false, message: "Coupon not found" });
    res.json({ success: true, message: "Coupon updated", data: coupon });
  } catch (error) { res.status(400).json({ success: false, message: error.message }); }
};
exports.toggleCoupon = async (req, res) => {
  try {
    const coupon = await Coupon.findOne({ _id: req.params.id, isDeleted: false });
    if (!coupon) return res.status(404).json({ success: false, message: "Coupon not found" });
    coupon.isActive = !coupon.isActive;
    await coupon.save();
    res.json({ success: true, message: coupon.isActive ? "Coupon activated" : "Coupon paused", data: coupon });
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
};
exports.deleteCoupon = async (req, res) => {
  try {
    const coupon = await Coupon.findOneAndUpdate({ _id: req.params.id, isDeleted: false }, { isActive: false, isDeleted: true }, { new: true });
    if (!coupon) return res.status(404).json({ success: false, message: "Coupon not found" });
    res.json({ success: true, message: "Coupon deleted" });
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
};