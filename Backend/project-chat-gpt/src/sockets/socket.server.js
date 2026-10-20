const { Server } = require("socket.io");
const cookie = require("cookie");
const { verify } = require("jsonwebtoken");
const userModel = require("../models/user.model.js");
const { generateAIResponse, generateVector } = require("../services/ai.service.js")
const Message = require("../models/messsage.model.js");
const { createMemory, queryMemory } = require('../services/vector.service.js')

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

        // 1. Check if the message has substance (skip pure greetings / empty acknowledgments)
        const isGreeting = /^(hi|hello|hey|ok|okay|bye|thanks|thank you|good morning|good night)$/i.test(message.trim());
        const hasSubstance = message.trim().length > 8 && !isGreeting;

        const vectorsPromise = generateVector(message);

        const [chatHistory, memory, userMessage, vectors] = await Promise.all([
          // finding last 10 msg for stm
          Message.find({ chatId }).sort({ createdAt: -1 }).limit(10),

          // Only query Pinecone if message is not a pure greeting
          !isGreeting
            ? vectorsPromise.then((vecs) =>
                queryMemory({
                  queryVector: vecs,
                  limit: 3,
                  metadata: { user: socket.user._id.toString() }
                })
              )
            : Promise.resolve([]),

          // saving user message in mongodb
          Message.create({
            chatId,
            role: "user",
            content: message
          }),

          // resolving vectors to use in createMemory below
          vectorsPromise
        ]);

        // Save to Pinecone ONLY if the user message has substance (skips greetings / noise)
        if (hasSubstance) {
          createMemory({
            vectors,
            messageId: userMessage._id.toString(),
            metadata: {
              chat: chatId,
              user: socket.user._id.toString(),
              role: 'user',
              message
            }
          }).catch((err) => console.error("Background LTM save error:", err));
        }

        chatHistory.reverse();

        // 2. Transform into Gemini's expected format
        const stm = chatHistory.map((msg) => ({
          role: msg.role === "user" ? "user" : "model",
          parts: [{ text: msg.content }],
        }));

        // 3. Build system instruction with high-confidence LTM context only (score >= 0.70)
        let systemInstruction = "You are a helpful AI assistant.";
        if (memory && memory.length > 0) {
          const relevantMemories = memory.filter((item) => typeof item.score === "number" ? item.score >= 0.7 : true);
          const memoriesText = relevantMemories
            .map((item) => item.metadata?.message)
            .filter(Boolean)
            .join("\n");

          if (memoriesText) {
            systemInstruction += `\n\nRelevant past information about this user:\n${memoriesText}\nUse this context when relevant, but do not recite it verbatim.`;
          }
        }

        // 4. Generate AI response (passing history + user prompt)
        const aiResponseText = await generateAIResponse({
          history: stm,
          prompt: message,
          systemInstruction
        });

        // 1. Save in Mongo
        const responseAiMessage = await Message.create({
          chatId,
          role: "model",
          content: aiResponseText
        });

        // 2. Deliver to user immediately!
        socket.emit("ai-response", {
          chatId,
          message: responseAiMessage
        });

      } catch (error) {
        console.error("Error generating AI response:", error.message);
        socket.emit("error", { message: "Failed to generate response" });
      }
    });
  });
}

module.exports = initSocketServer;
