const express = require('express')
const rateLimit = require('express-rate-limit')

const app = express()

const limiter = rateLimit({
    windowMs: 1 * 60 * 1000, // 15 minutes
    max: 100, // limit each IP to 100 requests per windowMs,
    message:"Too manay requests from this ip, please try again after a minute"
})

app.post('/api/auth/register',limiter,(req,res)=>{
    res.status(201).json({
        message:"You have successfully registered"
    })
})

app.listen(3000, () => {
    console.log("Server is running on port 3000");
})