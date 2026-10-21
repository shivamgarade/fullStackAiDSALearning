const { Server } = require("socket.io");
const cookie = require("cookie");
const { verify } = require("jsonwebtoken");
const userModel = require("../models/user.model.js");
const { generateAIResponse, generateAIResponseStream, generateVector } = require("../services/ai.service.js");
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
        const trimmedMessage = (message || "").trim();

        if (!trimmedMessage) {
          return;
        }

        // 1. Asynchronously persist user message in MongoDB (Fire-and-forget, non-blocking)
        const userMessagePromise = Message.create({
          chatId,
          role: "user",
          content: trimmedMessage,
        }).catch((err) => console.error("Error saving user message to MongoDB:", err.message));

        // 2. Determine substance for long-term memory
        const isGreeting = /^(hi|hello|hey|ok|okay|bye|thanks|thank you|good morning|good night)$/i.test(trimmedMessage);
        const hasSubstance = trimmedMessage.length > 8 && !isGreeting;

        // 3. Asynchronously persist to Pinecone (Fire-and-forget, non-blocking)
        if (hasSubstance) {
          (async () => {
            try {
              const [userMsgDoc, vectors] = await Promise.all([
                userMessagePromise,
                generateVector(trimmedMessage),
              ]);
              if (userMsgDoc && vectors) {
                await createMemory({
                  vectors,
                  messageId: userMsgDoc._id.toString(),
                  metadata: {
                    chat: chatId,
                    user: socket.user._id.toString(),
                    role: "user",
                    message: trimmedMessage,
                  },
                });
              }
            } catch (err) {
              console.error("Background LTM save error:", err.message);
            }
          })();
        }

        // 4. Fetch Short-Term Memory (STM) from MongoDB
        const chatHistory = await Message.find({ chatId }, { role: 1, content: 1 })
          .sort({ _id: -1 })
          .limit(10)
          .lean();

        chatHistory.reverse();

        // Transform into Gemini Interactions API expected step format
        const stm = chatHistory.map((msg) => ({
          type: msg.role === "user" ? "user_input" : "model_output",
          content: [{ type: "text", text: msg.content }],
        }));

        const systemInstruction = "You are a helpful AI assistant. You have access to user memories and can search them with the search_memory tool when relevant.";

        // 5. Stream AI response with On-Demand Memory Retrieval (Tool Calling)
        let fullResponseText = "";
        const responseStream = generateAIResponseStream({
          history: stm,
          prompt: trimmedMessage,
          systemInstruction,
          onFunctionCall: async (call) => {
            if (call.name === "search_memory") {
              socket.emit("ai-status", {
                chatId,
                type: "recalling_memory",
                message: "Searching past memories...",
              });

              try {
                const searchQuery = call.arguments?.query || trimmedMessage;
                const queryVector = await generateVector(searchQuery);
                const memory = await queryMemory({
                  queryVector,
                  limit: 6,
                  metadata: { user: socket.user._id.toString() },
                });

                const relevantMemories = (memory || []).filter((item) => {
                  // Exclude current message self-matches
                  if (item.metadata?.message === trimmedMessage) return false;
                  return typeof item.score === "number" ? item.score >= 0.60 : true;
                });

                const memoriesText = relevantMemories
                  .map((item) => item.metadata?.message)
                  .filter(Boolean);

                return memoriesText.length > 0
                  ? memoriesText
                  : ["No relevant memories found in long-term memory."];
              } catch (err) {
                console.error("Error querying memory on demand:", err.message);
                return ["Error searching long-term memory."];
              }
            }
            return "Tool not recognized.";
          },
        });

        for await (const chunk of responseStream) {
          fullResponseText += chunk;
          socket.emit("ai-response-chunk", {
            chatId,
            chunk,
          });
        }

        // 5. Save the complete message once in MongoDB
        const responseAiMessage = await Message.create({
          chatId,
          role: "model",
          content: fullResponseText,
        });

        // 6. Signal stream completion with the final saved message document
        socket.emit("ai-response-end", {
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
