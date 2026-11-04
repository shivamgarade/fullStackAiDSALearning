const userModel = require('../models/user.model')
const bcrypt = require('bcryptjs')
const jwt = require('jsonwebtoken')
const redis = require('../db/redis')


async function registerUser(req, res) {
    try {
        const { username, email, password, fullName: { firstName, lastName } } = req.body

        const isUserAlreadyExists = await userModel.findOne({
            $or: [
                { username },
                { email }
            ]
        })

        if (isUserAlreadyExists) {
            return res.status(400).json({
                message: "Username or email already exists"
            })
        }


        const hash = await bcrypt.hash(password, 10);

        const user = await userModel.create({
            username,
            email,
            password: hash,
            fullName: { firstName, lastName }
        })

        const token = jwt.sign({
            id: user._id,
            username: user.username,
            email: user.email,
            role: user.role
        }, process.env.JWT_SECRET, { expiresIn: "1d" })

        res.cookie("token", token, {
            httpOnly: true,
            maxAge: 24 * 60 * 60 * 1000,
            secure: true
        })

        res.status(201).json({
            message: "User registered successfully",
            user: {
                _id: user._id,
                username: user.username,
                email: user.email,
                fullName: user.fullName,
                role: user.role,
                addresses: user.addresses
            }
        })
    } catch (error) {
        console.log("Error in registerUser : ", error);
        res.status(500).json({
            message: "Internal server error"
        })
    }
}

async function loginUser(req, res) {
    try {
        const { username, email, password } = req.body;

        const user = await userModel.findOne({ $or: [{ username }, { email }] }).select('+password');

        if (!user) {
            return res.status(401).json({
                message: "Invalid email or password"
            });
        }

        const isPasswordValid = await bcrypt.compare(password, user.password);

        if (!isPasswordValid) {
            return res.status(401).json({
                message: "Invalid email or password"
            });
        }

        const token = jwt.sign({
            id: user._id,
            username: user.username,
            email: user.email,
            role: user.role
        }, process.env.JWT_SECRET, { expiresIn: "1d" });

        res.cookie("token", token, {
            httpOnly: true,
            maxAge: 24 * 60 * 60 * 1000,
            secure: true
        });

        res.status(200).json({
            message: "User logged in successfully",
            user: {
                _id: user._id,
                username: user.username,
                email: user.email,
                fullName: user.fullName,
                role: user.role,
                addresses: user.addresses
            }
        });
    } catch (error) {
        console.log("Error in loginUser : ", error);
        res.status(500).json({
            message: "Internal server error"
        });
    }
}

async function getCurrentUser(req, res) {
    
    return res.status(200).json({
        message: "User fetched successfully",
        user: req.user
    });
}

async function logoutUser(req, res) {
    const token = req.cookies?.token;

    if(token){
        await redis.set(`blacklist:${token}`,"true",24 * 60 * 60);
    }
    
    res.clearCookie("token",{
        httpOnly: true,
        secure: true
    });
    
    return res.status(200).json({
        message: "User logged out successfully"
    });
}

module.exports = { registerUser, loginUser, getCurrentUser, logoutUser }
