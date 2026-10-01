const express = require("express");
const router = express.Router();
const { protectCustomer } = require("../middleware/auth");
const {
  initiatePayUPayment,
  handlePayUResponse,
} = require("../controllers/paymentController");

router.post("/payu/initiate", protectCustomer, initiatePayUPayment);
router.post("/payu/response", handlePayUResponse);

module.exports = router;
