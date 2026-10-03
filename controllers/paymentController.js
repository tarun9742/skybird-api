const crypto = require("crypto");
const Course = require("../models/Course");
const User = require("../models/User");
const PaymentTransaction = require("../models/PaymentTransaction");
const CouponUsage = require("../models/CouponUsage");
const { findCourse, validateCoupon, reserveCoupon, releaseCoupon, consumeCoupon } = require("../services/couponService");

const getPayUConfig = () => {
  const key = process.env.PAYU_MERCHANT_KEY || "gtKFFx";
  const salt = process.env.PAYU_MERCHANT_SALT || "eCwWELxi";
  const isLive = process.env.PAYU_MODE === "LIVE";
  return {
    key, salt, isLive,
    actionUrl: isLive ? "https://secure.payu.in/_payment" : "https://test.payu.in/_payment",
    frontendUrl: process.env.FRONTEND_URL || "http://localhost:5173",
    apiBaseUrl: process.env.API_BASE_URL || `http://localhost:${process.env.PORT || 5000}`,
  };
};
const makeTxnId = () => `TXN_${Date.now()}_${Math.random().toString(36).slice(2,8).toUpperCase()}`;
const productInfo = title => String(title || "Course").slice(0,99).replace(/[^a-zA-Z0-9 ]/g,"");
const requestHash = (c,p) => crypto.createHash("sha512").update(`${c.key}|${p.txnid}|${p.amount}|${p.productinfo}|${p.firstname}|${p.email}|${p.udf1}|${p.udf2}|${p.udf3}|${p.udf4}|${p.udf5}||||||${c.salt}`).digest("hex");
const reverseHash = (c,b) => crypto.createHash("sha512").update(`${c.salt}|${b.status||""}||||||${b.udf5||""}|${b.udf4||""}|${b.udf3||""}|${b.udf2||""}|${b.udf1||""}|${b.email||""}|${b.firstname||""}|${b.productinfo||""}|${b.amount||""}|${b.txnid||""}|${c.key}`).digest("hex");

async function fail(tx, reason) {
  if (!tx || tx.status !== "PENDING") return;
  tx.status = "FAILED";
  tx.failureReason = String(reason || "Payment failed").slice(0,500);
  await tx.save();
  if (tx.coupon) await releaseCoupon(tx.coupon);
}

exports.initiatePayUPayment = async (req,res) => {
  let reserved = null;
  try {
    const { courseId, couponCode } = req.body;
    if (!courseId) return res.status(400).json({success:false,message:"courseId is required"});
    const course = await findCourse(courseId);
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({success:false,message:"User not found"});
    if (user.purchasedCourses.some(x=>x.course && x.course.toString()===course._id.toString()))
      return res.status(400).json({success:false,message:"You have already purchased this course"});

    let coupon=null, pricing={discountAmount:0,finalAmount:Number(Number(course.price).toFixed(2))};
    if (couponCode) {
      const result=await validateCoupon({course,userId:user._id,code:couponCode});
      coupon=result.coupon; pricing=result.pricing;
      const lock=await reserveCoupon({couponId:coupon._id,usageLimit:coupon.usageLimit});
      if(!lock) return res.status(400).json({success:false,message:"This coupon is no longer available"});
      reserved=coupon._id;
    }

    const txnid=makeTxnId();
    const transaction=await PaymentTransaction.create({
      txnid,user:user._id,course:course._id,courseId:course.id,
      coupon:coupon?coupon._id:null,couponCode:coupon?coupon.code:"",
      originalAmount:Number(course.price),discountAmount:Number(pricing.discountAmount),
      finalAmount:Number(pricing.finalAmount),status:"PENDING"
    });
    reserved=null;

    const c=getPayUConfig(), amount=Number(pricing.finalAmount).toFixed(2);
    const params={
      key:c.key,txnid,amount,productinfo:productInfo(course.title),
      firstname:(user.name||"Learner").trim().split(" ")[0]||"Learner",
      email:(user.email||`${user.mobile}@skybirds.in`).trim(),
      phone:(user.mobile||"9999999999").trim(),
      surl:`${c.apiBaseUrl}/api/payment/payu/response`,
      furl:`${c.apiBaseUrl}/api/payment/payu/response`,hash:"",
      udf1:user._id.toString(),udf2:course.id,udf3:course._id.toString(),
      udf4:coupon?coupon._id.toString():"",udf5:""
    };
    params.hash=requestHash(c,params);
    res.json({success:true,data:{action:c.actionUrl,params,course:{id:course.id,title:course.title,price:Number(course.price),discountAmount:Number(pricing.discountAmount),finalAmount:Number(pricing.finalAmount)},transactionId:transaction.txnid}});
  } catch(error) {
    if(reserved) { try { await releaseCoupon(reserved); } catch(_){} }
    res.status(error.statusCode||500).json({success:false,message:error.message||"Failed to initiate payment"});
  }
};

exports.handlePayUResponse = async (req,res) => {
  const c=getPayUConfig();
  try {
    const {txnid,amount,status,hash,mihpayid,error_Message,msg}=req.body;
    const tx=txnid?await PaymentTransaction.findOne({txnid}):null;
    if(!tx) return res.redirect(`${c.frontendUrl}/payment/failure?txnid=${encodeURIComponent(txnid||"")}&msg=Payment%20transaction%20not%20found`);

    const valid=reverseHash(c,req.body).toLowerCase()===String(hash||"").toLowerCase();
    const callbackAmount=Number(amount);
    if(!valid || !Number.isFinite(callbackAmount) || callbackAmount.toFixed(2)!==Number(tx.finalAmount).toFixed(2)) {
      tx.status="VERIFICATION_FAILED"; tx.failureReason="PayU response hash or amount verification failed"; await tx.save();
      if(tx.coupon) await releaseCoupon(tx.coupon);
      return res.redirect(`${c.frontendUrl}/payment/failure?txnid=${encodeURIComponent(txnid)}&courseId=${encodeURIComponent(tx.courseId)}&msg=Payment%20verification%20failed`);
    }

    if(status==="success") {
      if(tx.status!=="SUCCESS") {
        const user=await User.findById(tx.user), course=await Course.findById(tx.course);
        if(!user || !course || !course.isActive) { await fail(tx,"User or course not found"); return res.redirect(`${c.frontendUrl}/payment/failure?txnid=${encodeURIComponent(txnid)}&courseId=${encodeURIComponent(tx.courseId)}&msg=Course%20enrollment%20failed`); }
        if(!user.purchasedCourses.some(x=>x.course && x.course.toString()===course._id.toString())) {
          user.purchasedCourses.push({course:course._id,purchasedAt:new Date()}); await user.save();
        }
        tx.status="SUCCESS"; tx.payuId=mihpayid||""; tx.paidAt=new Date(); await tx.save();
        if(tx.coupon) {
          await consumeCoupon(tx.coupon);
          await CouponUsage.updateOne({transaction:tx._id},{$setOnInsert:{coupon:tx.coupon,user:tx.user,course:tx.course,transaction:tx._id,discountAmount:tx.discountAmount,usedAt:new Date()}},{upsert:true});
        }
      }
      return res.redirect(`${c.frontendUrl}/payment/success?txnid=${encodeURIComponent(txnid)}&courseId=${encodeURIComponent(tx.courseId)}&status=success`);
    }
    await fail(tx,error_Message||msg||"Payment was unsuccessful or cancelled.");
    return res.redirect(`${c.frontendUrl}/payment/failure?txnid=${encodeURIComponent(txnid)}&courseId=${encodeURIComponent(tx.courseId)}&msg=${encodeURIComponent(error_Message||msg||"Payment failed")}`);
  } catch(error) {
    return res.redirect(`${c.frontendUrl}/payment/failure?msg=${encodeURIComponent(error.message||"Payment processing error")}`);
  }
};
