const mongoose = require('mongoose')

async function connectToDB(){
    try {
        await mongoose.connect(process.env.MONGODB_URI)
        console.log("connected to db...")
    } catch (a) {
        console.error('Error connecting to the database')
    }
}

module.exports = connectToDB;