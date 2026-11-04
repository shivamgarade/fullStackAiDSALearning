const mongoose = require('mongoose')


async function connectToDB(){
    try{
        await mongoose.connect(process.env.MONGODB_URI)
        console.log("Database connected successfully!")
    }catch(err){
        console.error("Database connection failed",err)
    }
}

module.exports = connectToDB;