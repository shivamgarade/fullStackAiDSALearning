const { Server } = require("socket.io");
const cookie = require("cookie");
const { verify } = require("jsonwebtoken");
const userModel = require("../models/user.model.js");
const { generateAIResponse, generateAIResponseStream, generateVector, extractUserFacts } = require("../services/ai.service.js");
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
        Message.create({
          chatId,
          role: "user",
          content: trimmedMessage,
        }).catch((err) => console.error("Error saving user message to MongoDB:", err.message));

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

        // Emit initial thinking status
        socket.emit("ai-status", { chatId, status: "thinking" });

        // 5. Stream AI response with On-Demand Memory Retrieval (Tool Calling)
        let fullResponseText = "";
        let currentStatus = "thinking";

        const responseStream = generateAIResponseStream({
          history: stm,
          prompt: trimmedMessage,
          systemInstruction,
          onFunctionCall: async (call) => {
            if (call.name === "search_memory") {
              socket.emit("ai-status", {
                chatId,
                status: "recalling_memory",
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
                  const memoryContent = item.metadata?.fact || item.metadata?.message;
                  if (memoryContent === trimmedMessage) return false;
                  return typeof item.score === "number" ? item.score >= 0.60 : true;
                });

                const memoriesText = relevantMemories
                  .map((item) => item.metadata?.fact || item.metadata?.message)
                  .filter(Boolean);

                const result = memoriesText.length > 0
                  ? memoriesText
                  : ["No relevant memories found in long-term memory."];

                // Resume thinking state after tool completion
                socket.emit("ai-status", { chatId, status: "thinking" });
                return result;
              } catch (err) {
                console.error("Error querying memory on demand:", err.message);
                socket.emit("ai-status", { chatId, status: "thinking" });
                return ["Error searching long-term memory."];
              }
            }
            return "Tool not recognized.";
          },
        });

        for await (const item of responseStream) {
          if (typeof item === "string") {
            // Backwards compatibility for plain string chunks
            if (currentStatus !== "responding") {
              currentStatus = "responding";
              socket.emit("ai-status", { chatId, status: "responding" });
            }
            fullResponseText += item;
            socket.emit("ai-response-chunk", {
              chatId,
              chunk: item,
            });
          } else if (item && typeof item === "object") {
            if (item.type === "thought") {
              if (currentStatus !== "thinking") {
                currentStatus = "thinking";
                socket.emit("ai-status", { chatId, status: "thinking" });
              }
              socket.emit("ai-thought-chunk", {
                chatId,
                chunk: item.text,
              });
            } else if (item.type === "text") {
              if (currentStatus !== "responding") {
                currentStatus = "responding";
                socket.emit("ai-status", { chatId, status: "responding" });
              }
              fullResponseText += item.text;
              socket.emit("ai-response-chunk", {
                chatId,
                chunk: item.text,
              });
            }
          }
        }

        // 5. Save the complete message once in MongoDB (thoughts are NOT saved)
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

        // 7. Transition status to idle
        socket.emit("ai-status", { chatId, status: "idle" });

        // 8. Background Worker: Fact Extraction for Long-Term Memory (Non-blocking)
        (async () => {
          try {
            const { facts } = await extractUserFacts(trimmedMessage, fullResponseText);
            if (Array.isArray(facts) && facts.length > 0) {
              const userId = socket.user._id.toString();
              for (let i = 0; i < facts.length; i++) {
                const fact = facts[i];
                if (!fact || !fact.fact) continue;
                const vectors = await generateVector(fact.fact);
                await createMemory({
                  vectors,
                  messageId: `${responseAiMessage._id.toString()}_fact_${i}`,
                  metadata: {
                    user: userId,
                    chat: chatId,
                    fact: fact.fact,
                    category: fact.category,
                  },
                });
              }
            }
          } catch (err) {
            console.error("Background fact extraction error:", err.message);
          }
        })();

      } catch (error) {
        console.error("Error generating AI response:", error.message);
        socket.emit("ai-status", { chatId: data?.chatId, status: "idle" });
        socket.emit("error", { message: "Failed to generate response" });
      }
    });
  });
}

module.exports = initSocketServer;
