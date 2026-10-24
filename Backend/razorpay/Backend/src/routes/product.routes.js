const express = require('express');
const { createProduct,getItem } = require('../controllers/product.controller');

const router = express.Router()

router.post('/',createProduct)
router.get('/get-item',getItem)

module.exports = router;