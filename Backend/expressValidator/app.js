const express = require('express');
const { registerValidationRules } = require('./middleware/validator.middleware');

const app = express()
app.use(express.json())


app.post("/register",registerValidationRules,(req,res)=>{
    const   {username,email, password} = req.body;
    res.send("User registered successfully")
})

app.listen(3000,()=>{
    console.log("Server is running on port 3000")
})