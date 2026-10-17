const { Server } = require("socket.io");
const cookie = require("cookie");
const { verify } = require("jsonwebtoken");
const userModel = require("../models/user.model.js");
const {generateAIResponse,generateVector} = require("../services/ai.service.js")
const Message = require("../models/messsage.model.js");
const {createMemory,queryMemory} = require('../services/vector.service.js')

function initSocketServer(httpServer) {
  const io = new Server(httpServer, {});

  io.use(async (socket, next) => {
    const cookies = cookie.parseCookie(socket.handshake.headers?.cookie || "");

    if (!cookies.token) {
      next(new Error("Authentication error: No token provided"));
    }
    try {
      const decoded = verify(cookies.token, process.env.JWT_SECRET);
      const user = await userModel.findById(decoded.id);
      socket.user = user;
      next();
    } catch (error) {
      next(new Error("Authentication error:Invalid token"));
    }
  });

  io.on("connection", (socket) => {
    // listner for accepting single user data
    socket.on("ai-message", async (data) => {
      try {
        const { chatId, message } = data;

        // 1. Fetch previous messages for short-term memory (e.g., last 10)
        const rawHistory = await Message.find({ chatId })
          .sort({ createdAt: -1 })
          .limit(10);

        rawHistory.reverse();

        // 2. Transform into Gemini's expected format
        const history = rawHistory.map((msg) => ({
          role: msg.role === "user" ? "user" : "model",
          parts: [{ text: msg.content }],
        }))

        // 4. Save current user message to MongoDB
        const userMessage = await Message.create({
          chatId,
          role: "user",
          content: message,
        })

        const vectors = await generateVector(message)
        
        // users prompt saving in vector database
        await createMemory({
          vectors,
          messageId:userMessage._id.toString(),
          metadata:{
            chat:chatId,
            user:socket.user._id,
            role:'user',
            message
          }
        })

        const recentMemories = await queryMemory({
          queryVector:vectors,
          limit:3,
          metadata:{}
        })
        console.log(recentMemories)

        // 4. Generate AI response (passing history + user prompt)
        const aiResponseText = await generateAIResponse({
          history,
          prompt: message,
        });

        // 5. Save the AI response
        const responseAiMessage = await Message.create({
          chatId,
          role: "model",
          content: aiResponseText,
        });

        const vectorAiResponse = await generateVector(aiResponseText)

        // ai response saving in vector database
        await createMemory({
          vectors:vectorAiResponse,
          messageId:responseAiMessage._id.toString(),
          metadata:{
            chat:chatId,
            user:socket.user._id,
            role:'model',
            message:aiResponseText
          }
        })

        // 6. Emit to socket client
        socket.emit("ai-response", {
          chatId,
          message: responseAiMessage,
        });
      } catch (error) {
        console.error("Error generating AI response:", error.message);
        socket.emit("error", { message: "Failed to generate response" });
      }
    });
  });
}

module.exports = initSocketServer;
