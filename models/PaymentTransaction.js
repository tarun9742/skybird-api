const mongoose = require("mongoose");

const paymentTransactionSchema = new mongoose.Schema(
  {
    txnid: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      maxlength: 50,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    course: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Course",
      required: true,
    },
    courseId: {
      type: String,
      required: true,
    },
    coupon: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Coupon",
      default: null,
    },
    couponCode: {
      type: String,
      default: "",
    },
    originalAmount: {
      type: Number,
      required: true,
      min: 0,
    },
    discountAmount: {
      type: Number,
      default: 0,
      min: 0,
    },
    finalAmount: {
      type: Number,
      required: true,
      min: 0,
    },
    status: {
      type: String,
      enum: ["PENDING", "SUCCESS", "FAILED", "VERIFICATION_FAILED"],
      default: "PENDING",
    },
    payuId: {
      type: String,
      default: "",
    },
    failureReason: {
      type: String,
      default: "",
    },
    paidAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("PaymentTransaction", paymentTransactionSchema);
