const express = require('express');
const { createOrder, verifyOrder } = require('../controllers/payment.controller');

const router = express.Router()

router.post('/create-order',createOrder)
router.post('/verify',verifyOrder)

module.exports = router;