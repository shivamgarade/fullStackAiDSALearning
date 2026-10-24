require("dotenv").config();
const Razorpay = require("razorpay");
const paymentModel = require("../models/payment.model");
const productModel = require("../models/product.model");

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

async function createOrder(req, res) {
  try {
    const product = await productModel.findOne();

    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }

    const options = {
      amount: product.price.amount,
      currency: product.price.currency,
    };

    const order = await razorpay.orders.create(options);

    await paymentModel.create({
      orderId: order.id,
      price: {
        amount: order.amount,
        currency: order.currency,
      },
      currency: order.currency,
      status: "PENDING",
    });

    res.status(201).json(order);
  } catch (error) {
    console.log(error);
    res.status(500).json({ message: "Error creating order", error: error.message });
  }
}

async function verifyOrder(req, res) {
  const { razorpayOrderId, razorpayPaymentId, signature } = req.body;
  const secret = process.env.RAZORPAY_KEY_SECRET

  try {
    const { validatePaymentVerification } = require('../../node_modules/razorpay/dist/utils/razorpay-utils.js')

    const result = validatePaymentVerification({ "order_id": razorpayOrderId, "payment_id": razorpayPaymentId }, signature, secret);
    if (result) {
      const payment = await paymentModel.findOne({ orderId: razorpayOrderId });
      payment.paymentId = razorpayPaymentId;
      payment.signature = signature;
      payment.status = 'COMPLETED';
      await payment.save();
      res.json({ status: 'success' });
    } else {
      res.status(400).send('Invalid signature');
    }
  } catch (error) {
    console.log(error);
    res.status(500).send('Error verifying payment');
  }
}

module.exports = {
  createOrder,
  verifyOrder
};

