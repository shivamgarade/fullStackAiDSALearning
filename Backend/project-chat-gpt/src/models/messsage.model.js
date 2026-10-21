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
        required: function() {
            return !this.stopped;
        },
        default: ""
    },
    role:{
        type:String,
        enum:["user","model","system"],
        default:"user"
    },
    stopped:{
        type:Boolean,
        default:false
    }
},{
    timestamps:true
})

const messageModel = mongoose.model("message",messageSchema)

module.exports = messageModel