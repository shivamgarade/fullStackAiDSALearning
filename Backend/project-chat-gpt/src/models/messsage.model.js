const mongoose = require('mongoose')

const messageSchema = new mongoose.Schema({
    user:{
        type:mongoose.Schema.Types.ObjectId,
        ref:'user'
    },
    chatId:{
        type:mongoose.Schema.Types.ObjectId,
        ref:"chat",
        required:true,
        index: true
    },
    content:{
        type:String,
        required:true
    },
    role:{
        type:String,
        enum:["user","model","system"],
        default:"user"
    }
},{
    timestamps:true
})

const messageModel = mongoose.model("message",messageSchema)

module.exports = messageModel