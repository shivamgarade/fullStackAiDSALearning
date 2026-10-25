const { body, query, param, validationResult } = require('express-validator')

function validate(req, res, next) {
    const errors = validationResult(req)
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() })
    }
    next()
}

const registerValidationRules = [
    body('username')
        .optional()
        .isString().withMessage("Username must be a string")
        .isLength({ min: 3 }).withMessage("Username must be at least 3 characters long"),
    body("email")
        .isEmail().withMessage("Invalid email address")
        .custom((value) => {
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
            if (!emailRegex.test(value)) {
                throw new Error("Invalid email address")
            }
            return true
        }),
    body("password")
        .isLength({ min: 6 }).withMessage("Password must be at least 6 characters long"),
    validate
]


module.exports = { registerValidationRules, validate }