const User = require("../models/User");
const Course = require("../models/Course");

// @desc    Get courses purchased by logged-in customer
// @route   GET /api/customer/purchased
exports.getPurchasedCourses = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).populate({
      path: "purchasedCourses.course",
      model: "Course",
    });

    const purchased = user.purchasedCourses
      .filter((item) => item.course) // remove deleted courses
      .map((item) => ({
        ...item.course.toObject(),
        purchasedAt: item.purchasedAt,
      }));

    res.status(200).json({
      success: true,
      count: purchased.length,
      data: purchased,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// @desc    Purchase a course (simulation)
// @route   POST /api/customer/purchase
exports.purchaseCourse = async (req, res) => {
  try {
    const { courseId } = req.body;

    if (!courseId) {
      return res.status(400).json({
        success: false,
        message: "courseId is required",
      });
    }

    // Find course by custom id or Mongo _id
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

    // Check if already purchased
    const alreadyPurchased = user.purchasedCourses.some(
      (item) => item.course.toString() === course._id.toString()
    );

    if (alreadyPurchased) {
      return res.status(400).json({
        success: false,
        message: "You have already purchased this course",
      });
    }

    user.purchasedCourses.push({
      course: course._id,
      purchasedAt: new Date(),
    });

    await user.save();

    res.status(200).json({
      success: true,
      message: "Course purchased successfully",
      data: {
        courseId: course.id,
        title: course.title,
        price: course.price,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// @desc    Get customer profile
// @route   GET /api/customer/profile
exports.getProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select("-__v");

    res.status(200).json({
      success: true,
      data: user,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// @desc    Update customer profile
// @route   PUT /api/customer/profile
exports.updateProfile = async (req, res) => {
  try {
    const { name } = req.body;

    const user = await User.findByIdAndUpdate(
      req.user._id,
      { name },
      { new: true, runValidators: true }
    ).select("-__v");

    res.status(200).json({
      success: true,
      message: "Profile updated",
      data: user,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};
