const { body, validationResult } = require('express-validator')

const respondWithValidationErrors = (req, res, next) => {
    const errors = validationResult(req)
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() })
    }
    next()
}

const registerUserValidations = [
    body("username")
        .isString().withMessage("Username must be a string")
        .isLength({ min: 3 }).withMessage("Username must be at least 3 characters long"),
    body('email')
        .isEmail().withMessage("Invalid email address"),
    body("password")
        .isLength({ min: 6 }).withMessage("Password must be at least 6 characters long"),
    body("fullName.firstName")
        .isString().withMessage("First name must be a string")
        .notEmpty().withMessage("First name is required"),
    body("fullName.lastName")
        .isString().withMessage("Last name must be a string")
        .notEmpty().withMessage("Last is required"),
    respondWithValidationErrors
]

const loginUserValidations = [
    body('email')
        .isEmail()
        .withMessage("Invalid email address")
        .optional(),
    body('username')
        .optional()
        .isString()
        .withMessage("Username must be a string"),
    body()
        .custom((value, { req }) => {
            if (!req.body.email && !req.body.username) {
                throw new Error('Email or username must be provided')
            }
            return true
        }),
    body("password")
        .notEmpty()
        .withMessage("Password is required"),
    respondWithValidationErrors
]

module.exports = {
    registerUserValidations,
    loginUserValidations
}
