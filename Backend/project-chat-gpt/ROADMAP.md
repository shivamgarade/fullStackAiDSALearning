# Production-Grade AI Chatbot Roadmap & Implementation Prompts

This document outlines the gaps between a basic API wrapper and a production-grade conversational AI platform (like ChatGPT, Claude, and Gemini Advanced). It provides detailed architectural explanations and **ready-to-use copy-paste prompts** so you can implement each feature step-by-step in a new chat session without risking regressions.

---

## 1. Feature Comparison & Architecture Table

| # | Feature | What is it? | Why We Need It (The Current Gap) | How Production Works | Implementation Approach |
|---|---|---|---|---|---|
| **1** | **On-Demand Memory (Tool Calling)** | The AI decides *when* to search Pinecone using a `search_memory` tool. | Currently, we query Pinecone on every substantive message, adding network delay even for generic questions ("write quicksort in Python"). | Gemini evaluates the prompt. If memory is needed, it calls `search_memory("user tech stack")`. If not, it streams immediately. | Define `search_memory` tool in Gemini Interactions API; handle `function_call` & `function_result` in socket server. |
| **2** | **Smart Fact Extraction** | Storing clean, extracted user facts rather than raw user question messages. | We currently save raw messages (e.g. *"can you remember my name?"*) into Pinecone. Questions pollute vector similarity against actual answers. | An asynchronous background task analyzes completed turns, extracts lasting user facts (`{ fact: "User's name is Shivam" }`), and embeds only the fact. | Background Gemini call after turn completion with structured JSON output schema `[ { fact, category } ]` -> upsert to Pinecone. |
| **3** | **Live Thought & Status Streaming** | Streaming the AI's internal reasoning and status updates to the client. | Users currently see no status indication while the model searches memory or thinks. | The UI displays `"Recalling memory..."`, followed by an expandable `"Thinking..."` box that streams reasoning before text. | Listen for `step.start` (`type: "thought"`) and emit `socket.emit("ai-thought-chunk", ...)` & `socket.emit("ai-status", ...)`. |
| **4** | **Stream Interruption ("Stop Generating")** | Allowing users to halt an in-flight response immediately. | If a user clicks Stop or closes the tab, the backend continues generating tokens and burning API limits. | Client sends a `stop-generation` event. Server calls `abortController.abort()` to cancel the Gemini stream and saves partial text. | Map `chatId` to an active `AbortController` in memory; listen for `socket.on("stop-generation")` and abort the stream. |
| **5** | **Rolling Context Summarization** | Condensing older conversation history instead of a hard 10-message cutoff. | Messages 11+ are completely forgotten from Short-Term Memory (STM) once they roll past the `limit(10)` window. | Messages 1–20 are compressed into a concise 2-sentence rolling summary (`"Summary of earlier discussion: ..."`), while messages 21–30 are kept verbatim. | When `Message.countDocuments({ chatId }) > 10`, summarize older messages in background and inject into `systemInstruction`. |
| **6** | **Auto Chat Titling** | Generating an intelligent 3–4 word sidebar title after Turn 1. | Chat titles are hardcoded or left as `"New Chat"`. | After the first user message and AI response, a fast background worker generates a clean title and pushes it to the UI. | After Turn 1 completes, fire a non-blocking `gemini-3.5-flash-lite` call to generate a 3-word title -> update `Chat` model -> emit `chat-renamed`. |

---

## 2. Step-by-Step Copy-Paste Prompts for New Chats

Use these prompts one by one in fresh chat sessions to build each capability cleanly.

---

### 📋 PROMPT 1: On-Demand Memory Retrieval via Gemini Function Calling

```text
Task: Implement On-Demand Memory Retrieval using Gemini Function Calling (Interactions API).

Current State:
In `src/sockets/socket.server.js`, we eagerly query Pinecone on every message before invoking Gemini.

Objective:
Instead of querying Pinecone on every message, define a `search_memory` tool for the Gemini model. When a user asks a question, let Gemini decide whether it needs past memory. If Gemini calls `search_memory`, execute the Pinecone vector query, return the function result, and let Gemini stream the final response.

Requirements:
1. In `src/services/ai.service.js`:
   - Declare the `search_memory` tool definition with parameter `query: string`.
   - Update `generateAIResponseStream` to support tool declarations and handling function calls.
2. In `src/sockets/socket.server.js`:
   - When Gemini yields a `function_call` step for `search_memory`:
     - Emit `socket.emit("ai-status", { type: "recalling_memory", message: "Searching past memories..." })`.
     - Execute `generateVector(args.query)` and `queryMemory(...)`.
     - Return the memory matches back to Gemini via `function_result`.
   - Stream the final answer chunks via `ai-response-chunk` as usual.
3. If Gemini does NOT call the tool (e.g. general coding questions), verify that it streams immediately without querying Pinecone.
4. Keep the code clean, modular, and handle errors gracefully.
```

---

### 📋 PROMPT 2: Smart Fact Extraction for Long-Term Memory (Clean Memory Ingestion)

```text
Task: Implement Background Fact Extraction for Long-Term Memory.

Current State:
In `src/sockets/socket.server.js`, we save raw user messages directly into Pinecone. This pollutes vector search with question phrases rather than declarative facts.

Objective:
Build an asynchronous background worker that extracts clean, permanent user facts after each conversation turn and saves only the facts into Pinecone.

Requirements:
1. In `src/services/ai.service.js`:
   - Create a helper `extractUserFacts(userMessage, aiResponse)` using `gemini-3.5-flash-lite` with structured JSON output:
     `{ facts: [ { fact: string, category: "identity" | "preference" | "project" | "skill" } ] }`.
   - If the user message is just a general question or greeting, it should return an empty array `{ facts: [] }`.
2. In `src/sockets/socket.server.js`:
   - In the background worker after generating the AI response:
     - Run `extractUserFacts(message, fullResponseText)`.
     - For each extracted fact, generate its embedding vector and upsert it into Pinecone with metadata `{ user: userId, chat: chatId, fact: fact.fact, category: fact.category }`.
3. Verify that raw questions like "can you remember my name?" are NOT saved to Pinecone, while statements like "I am Shivam, a backend developer" produce clean stored facts.
```

---

### 📋 PROMPT 3: Live Thought Streaming & Status Events

```text
Task: Implement Live Thought Streaming and Status Events for Socket.io.

Current State:
The socket server emits `ai-response-chunk` for the final text output, but internal model reasoning (`thought` steps) and status updates are not sent to the client.

Objective:
Stream Gemini's thinking process to the frontend in real time, along with status updates, so the UI can render a "Thinking..." disclosure widget like ChatGPT / Gemini Advanced.

Requirements:
1. In `src/services/ai.service.js`:
   - In `generateAIResponseStream`, differentiate between:
     - Thought steps (`event.event_type === "step.delta" && event.delta?.type === "thought_summary"`) or thought events.
     - Model output text steps (`event.delta?.type === "text"`).
   - Yield typed objects: `{ type: "thought", text }` and `{ type: "text", text }`.
2. In `src/sockets/socket.server.js`:
   - Emit `socket.emit("ai-thought-chunk", { chatId, chunk: item.text })` when receiving thought chunks.
   - Emit `socket.emit("ai-response-chunk", { chatId, chunk: item.text })` when receiving final answer chunks.
   - Emit `socket.emit("ai-status", { chatId, status: "thinking" | "responding" | "idle" })`.
3. Ensure backwards compatibility and verify that thoughts are NOT saved into the MongoDB message content.
```

---

### 📋 PROMPT 4: "Stop Generating" (Client Abort & Stream Cancellation)

```text
Task: Implement "Stop Generating" stream cancellation via AbortController.

Current State:
Once an AI response begins streaming, there is no way for the user to cancel it. The server continues generating until completion.

Objective:
Allow the client to emit a `stop-generation` event that immediately cancels the active Gemini stream, saves whatever partial text was generated up to that moment in MongoDB, and signals completion.

Requirements:
1. In `src/sockets/socket.server.js`:
   - Maintain an in-memory map of active generation sessions: `activeStreams = new Map<chatId, AbortController>()`.
   - When `ai-message` starts, instantiate an `AbortController` and associate it with `chatId`. Pass `abortController.signal` into the Gemini stream options.
   - Add a socket event listener: `socket.on("stop-generation", ({ chatId }) => { ... })`.
   - When triggered, abort the active controller.
   - Catch the abort signal in the stream loop:
     - Save the accumulated `fullResponseText` (partial output) to MongoDB with a flag `{ stopped: true }`.
     - Emit `socket.emit("ai-response-end", { chatId, message: partialMessage, stopped: true })`.
   - Clean up the `activeStreams` map on completion or error.
```

---

### 📋 PROMPT 5: Rolling Context Window Summarization (Beating the 10-Message Cliff)

```text
Task: Implement Rolling Context Window Summarization for Short-Term Memory.

Current State:
We only fetch the last 10 messages from MongoDB (`limit(10)`). Older messages in longer conversations are completely lost from context.

Objective:
When a chat exceeds 10 messages, summarize earlier messages (e.g. messages 1 to N-10) into a compact rolling summary and inject it into the Gemini `systemInstruction`, while keeping the last 10 messages verbatim.

Requirements:
1. In `src/models/chat.model.js` (or `user.model.js` / dedicated field):
   - Add a `contextSummary: { type: String, default: "" }` field to store the rolling summary of the chat.
2. In `src/services/ai.service.js`:
   - Create a helper `summarizeConversation({ previousSummary, olderMessages })` that produces a 2-3 sentence update of key topics, decisions, and context.
3. In `src/sockets/socket.server.js`:
   - Count total messages in `chatId`. If `totalCount > 10`:
     - Load `chat.contextSummary`.
     - If new unsummarized messages exist, trigger a background update of `contextSummary`.
     - Inject `contextSummary` into `systemInstruction`: `"Summary of earlier discussion in this chat: ${contextSummary}"`.
   - Keep passing the latest 10 messages as verbatim `steps`.
```

---

### 📋 PROMPT 6: Automated Background Chat Titling

```text
Task: Implement Automated Background Chat Titling after Turn 1.

Current State:
Chats have default titles and are not automatically named according to conversation content.

Objective:
After the user and AI complete Turn 1 in a new chat, run a background worker that generates a concise 3-4 word title (e.g. "Fullstack Career Advice") using Gemini, updates the Chat document in MongoDB, and notifies the client via Socket.io.

Requirements:
1. In `src/sockets/socket.server.js`:
   - After saving `responseAiMessage`, check if the chat currently has only 2 messages (1 user, 1 model) and its title is default (e.g. "New Chat" or null).
   - If true, trigger a non-blocking background task.
2. Background task:
   - Call Gemini with `gemini-3.5-flash-lite`: `"Generate a concise 3 to 5 word title summarizing this conversation. Return ONLY the title with no quotes or punctuation: User: ${userMsg} AI: ${aiMsg}"`.
   - Update the `Chat` document: `await Chat.findByIdAndUpdate(chatId, { title: generatedTitle })`.
   - Emit to socket: `socket.emit("chat-renamed", { chatId, title: generatedTitle })`.
```
