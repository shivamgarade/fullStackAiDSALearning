const { GoogleGenAI } = require("@google/genai");

const ai = new GoogleGenAI({});

const searchMemoryTool = {
  type: "function",
  name: "search_memory",
  description: "Search past user memories, preferences, and personal facts from long-term memory.",
  parameters: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "The search query to look up in memory.",
      },
    },
    required: ["query"],
  },
};

function formatSteps({ history = [], prompt }) {
  const steps = history.map((msg) => {
    if (msg.type && msg.content) {
      return msg;
    }
    const text = msg.content || (msg.parts && msg.parts[0]?.text) || "";
    return {
      type: msg.role === "user" ? "user_input" : "model_output",
      content: [{ type: "text", text }],
    };
  });

  if (prompt) {
    const lastStep = steps[steps.length - 1];
    const isAlreadyLast =
      lastStep &&
      lastStep.type === "user_input" &&
      lastStep.content?.[0]?.text === prompt;

    if (!isAlreadyLast) {
      steps.push({
        type: "user_input",
        content: [{ type: "text", text: prompt }],
      });
    }
  }

  return steps;
}

async function generateAIResponse({ history = [], prompt, systemInstruction, tools }) {
  const steps = formatSteps({ history, prompt });

  const interaction = await ai.interactions.create({
    model: "gemini-3.5-flash-lite",
    input: steps,
    system_instruction: systemInstruction || undefined,
    tools: Array.isArray(tools) ? tools : undefined,
  });

  return interaction.output_text;
}

async function* generateAIResponseStream({
  history = [],
  prompt,
  systemInstruction,
  tools = [searchMemoryTool],
  onFunctionCall,
  signal,
}) {
  const steps = formatSteps({ history, prompt });
  const activeTools = Array.isArray(tools) && tools.length > 0 ? tools : undefined;

  let currentInput = steps;
  let previousId = null;
  try {
    while (true) {
      if (signal?.aborted) {
        break;
      }

      const stream = await ai.interactions.create(
        {
          model: "gemini-3.5-flash-lite",
          input: currentInput,
          previous_interaction_id: previousId,
          system_instruction: systemInstruction || undefined,
          tools: activeTools,
          stream: true,
          generation_config: {
            thinking_summaries: "auto",
          },
        },
        signal ? { signal } : undefined
      );

      let functionCall = null;
      let partialArgs = "";

      for await (const event of stream) {
        if (signal?.aborted) {
          break;
        }
        if (event.event_type === "interaction.created" && event.interaction?.id) {
          previousId = event.interaction.id;
        }
        if (event.event_type === "interaction.status_update" && event.interaction_id) {
          if (!previousId) previousId = event.interaction_id;
        }
        if (event.event_type === "step.start" && event.step?.type === "function_call") {
          functionCall = {
            id: event.step.id,
            name: event.step.name,
            arguments: event.step.arguments || {},
          };
        }
        if (event.event_type === "step.delta") {
          if (event.delta?.type === "arguments_delta" || event.delta?.type === "arguments") {
            partialArgs += event.delta.arguments || event.delta.partial_arguments || "";
          } else if (event.delta?.type === "thought_summary" || event.delta?.type === "thought") {
            const thoughtText =
              event.delta.content?.text ||
              (typeof event.delta.content === "string" ? event.delta.content : "") ||
              event.delta.text ||
              "";
            if (thoughtText) {
              yield { type: "thought", text: thoughtText };
            }
          } else if (event.delta?.type === "text" && event.delta?.text) {
            yield { type: "text", text: event.delta.text };
          }
        }
        if (event.event_type === "interaction.completed" && event.interaction?.id) {
          previousId = event.interaction.id;
        }
      }

      if (signal?.aborted || !functionCall) {
        break;
      }

      if (partialArgs) {
        try {
          functionCall.arguments = JSON.parse(partialArgs);
        } catch (err) {
          console.error("Error parsing function call arguments:", err.message);
        }
      }

      let toolResult;
      if (typeof onFunctionCall === "function") {
        toolResult = await onFunctionCall(functionCall);
      } else {
        toolResult = yield functionCall;
      }

      if (signal?.aborted) {
        break;
      }

      currentInput = [
        {
          type: "function_result",
          call_id: functionCall.id,
          name: functionCall.name,
          result:
            typeof toolResult === "string"
              ? [{ type: "text", text: toolResult }]
              : [{ type: "text", text: JSON.stringify(toolResult ?? "") }],
        },
      ];
    }
  } catch (err) {
    if (
      signal?.aborted ||
      err.name === "AbortError" ||
      err.name === "APIUserAbortError" ||
      err.message?.toLowerCase().includes("abort")
    ) {
      return;
    }
    throw err;
  }
}

async function generateVector(content){
  const response = await ai.models.embedContent({
    model:'gemini-embedding-2',
    contents:content,
    config:{
      outputDimensionality:768
    }
  })

  return response.embeddings[0].values
}

const factExtractionSchema = {
  type: "object",
  properties: {
    facts: {
      type: "array",
      description: "List of permanent facts about the user extracted from the conversation turn. Empty if none.",
      items: {
        type: "object",
        properties: {
          fact: {
            type: "string",
            description: "A clear, concise, standalone declarative fact about the user (e.g. 'User is a backend developer').",
          },
          category: {
            type: "string",
            enum: ["identity", "preference", "project", "skill"],
            description: "The category that best describes this fact.",
          },
        },
        required: ["fact", "category"],
      },
    },
  },
  required: ["facts"],
};

async function extractUserFacts(userMessage, aiResponse) {
  if (!userMessage || typeof userMessage !== "string" || !userMessage.trim()) {
    return { facts: [] };
  }

  const prompt = `Analyze the following conversation turn between a User and an AI Assistant.
Extract any permanent, enduring facts about the USER (such as their identity, preferences, active projects, or skills).

Guidelines:
- Only extract personal facts explicitly revealed or confirmed about the user.
- Do NOT extract questions (e.g. "Can you remember my name?"), conversational filler, greetings, or temporary tasks.
- If the user is merely asking a question, greeting, or chatting without stating anything permanent about themselves, return an empty facts array.
- Formulate each fact as a clear, standalone declarative statement (e.g., "User's name is Shivam", "User is a backend developer").

User Message: "${userMessage.trim()}"
AI Response: "${aiResponse || ""}"`;

  try {
    const interaction = await ai.interactions.create({
      model: "gemini-3.5-flash-lite",
      input: prompt,
      system_instruction: "You are an expert fact extraction engine for a long-term memory system. Extract clean, permanent user facts in structured JSON.",
      response_format: {
        type: "text",
        mime_type: "application/json",
        schema: factExtractionSchema,
      },
    });

    const outputText = interaction.output_text;
    if (!outputText) {
      return { facts: [] };
    }

    const parsed = JSON.parse(outputText);
    if (parsed && Array.isArray(parsed.facts)) {
      return parsed;
    }
    return { facts: [] };
  } catch (error) {
    console.error("Error extracting user facts:", error.message);
    return { facts: [] };
  }
}

module.exports = {
  generateAIResponse,
  generateAIResponseStream,
  generateVector,
  searchMemoryTool,
  extractUserFacts,
};

