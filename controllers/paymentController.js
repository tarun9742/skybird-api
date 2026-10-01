const crypto = require("crypto");
const Course = require("../models/Course");
const User = require("../models/User");

const getPayUConfig = () => {
  const key = process.env.PAYU_MERCHANT_KEY || "gtKFFx";
  const salt = process.env.PAYU_MERCHANT_SALT || "eCwWELxi";
  const isLive = process.env.PAYU_MODE === "LIVE";
  const actionUrl = isLive
    ? "https://secure.payu.in/_payment"
    : "https://test.payu.in/_payment";
  const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5173";
  const apiBaseUrl = process.env.API_BASE_URL || `http://localhost:${process.env.PORT || 5000}`;

  return { key, salt, isLive, actionUrl, frontendUrl, apiBaseUrl };
};

exports.initiatePayUPayment = async (req, res) => {
  try {
    const { courseId } = req.body;

    if (!courseId) {
      return res.status(400).json({
        success: false,
        message: "courseId is required",
      });
    }

    let course = await Course.findOne({ id: courseId, isActive: true });
    if (!course) {
      course = await Course.findById(courseId);
    }

    if (!course || !course.isActive) {
      return res.status(404).json({
        success: false,
        message: "Course not found",
      });
    }

    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    const alreadyPurchased = user.purchasedCourses.some(
      (item) => item.course && item.course.toString() === course._id.toString()
    );

    if (alreadyPurchased) {
      return res.status(400).json({
        success: false,
        message: "You have already purchased this course",
      });
    }

    const config = getPayUConfig();
    const txnid = `TXN_${Date.now()}_${Math.random().toString(36).substring(2, 7).toUpperCase()}`;
    const amount = Number(course.price).toFixed(2);
    const productinfo = (course.title || "Course").substring(0, 99).replace(/[^a-zA-Z0-9 ]/g, "");
    const firstname = (user.name || "Learner").trim().split(" ")[0] || "Learner";
    const email = (user.email || `${user.mobile}@skybirds.in`).trim();
    const phone = (user.mobile || "9999999999").trim();

    const udf1 = user._id.toString();
    const udf2 = course.id;
    const udf3 = course._id.toString();
    const udf4 = "";
    const udf5 = "";

    const hashString = `${config.key}|${txnid}|${amount}|${productinfo}|${firstname}|${email}|${udf1}|${udf2}|${udf3}|${udf4}|${udf5}||||||${config.salt}`;
    const hash = crypto.createHash("sha512").update(hashString).digest("hex");

    const surl = `${config.apiBaseUrl}/api/payment/payu/response`;
    const furl = `${config.apiBaseUrl}/api/payment/payu/response`;

    res.status(200).json({
      success: true,
      data: {
        action: config.actionUrl,
        params: {
          key: config.key,
          txnid,
          amount,
          productinfo,
          firstname,
          email,
          phone,
          surl,
          furl,
          hash,
          udf1,
          udf2,
          udf3,
          udf4,
          udf5,
        },
        course: {
          id: course.id,
          title: course.title,
          price: course.price,
        },
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message || "Failed to initiate payment",
    });
  }
};

exports.handlePayUResponse = async (req, res) => {
  try {
    const {
      status,
      txnid,
      amount,
      productinfo,
      firstname,
      email,
      udf1,
      udf2,
      udf3,
      udf4,
      udf5,
      hash,
      error_Message,
      msg,
    } = req.body;

    const config = getPayUConfig();
    const frontendUrl = config.frontendUrl;

    const reverseHashString = `${config.salt}|${status}||||||${udf5 || ""}|${udf4 || ""}|${udf3 || ""}|${udf2 || ""}|${udf1 || ""}|${email || ""}|${firstname || ""}|${productinfo || ""}|${amount || ""}|${txnid || ""}|${config.key}`;
    const calculatedHash = crypto.createHash("sha512").update(reverseHashString).digest("hex");

    const isHashValid = calculatedHash.toLowerCase() === (hash || "").toLowerCase();

    if (status === "success" && (isHashValid || !config.isLive)) {
      if (udf1 && (udf3 || udf2)) {
        const user = await User.findById(udf1);
        let course = null;
        if (udf3) course = await Course.findById(udf3);
        if (!course && udf2) course = await Course.findOne({ id: udf2 });

        if (user && course) {
          const alreadyPurchased = user.purchasedCourses.some(
            (item) => item.course && item.course.toString() === course._id.toString()
          );

          if (!alreadyPurchased) {
            user.purchasedCourses.push({
              course: course._id,
              purchasedAt: new Date(),
            });
            await user.save();
          }
        }
      }

      return res.redirect(
        `${frontendUrl}/payment/success?txnid=${encodeURIComponent(txnid || "")}&courseId=${encodeURIComponent(udf2 || "")}&status=success`
      );
    } else {
      const failureReason = error_Message || msg || "Payment was unsuccessful or cancelled.";
      return res.redirect(
        `${frontendUrl}/payment/failure?txnid=${encodeURIComponent(txnid || "")}&courseId=${encodeURIComponent(udf2 || "")}&msg=${encodeURIComponent(failureReason)}`
      );
    }
  } catch (error) {
    const config = getPayUConfig();
    return res.redirect(
      `${config.frontendUrl}/payment/failure?msg=${encodeURIComponent(error.message || "An error occurred during payment processing")}`
    );
  }
};
