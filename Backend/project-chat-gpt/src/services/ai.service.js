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
}) {
  const steps = formatSteps({ history, prompt });
  const activeTools = Array.isArray(tools) && tools.length > 0 ? tools : undefined;

  let currentInput = steps;
  let previousId = null;

  while (true) {
    const stream = await ai.interactions.create({
      model: "gemini-3.5-flash-lite",
      input: currentInput,
      previous_interaction_id: previousId,
      system_instruction: systemInstruction || undefined,
      tools: activeTools,
      stream: true,
      generation_config: {
        thinking_level: "minimal",
      },
    });

    let functionCall = null;
    let partialArgs = "";

    for await (const event of stream) {
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
        } else if (event.delta?.type === "text" && event.delta?.text) {
          yield event.delta.text;
        }
      }
      if (event.event_type === "interaction.completed" && event.interaction?.id) {
        previousId = event.interaction.id;
      }
    }

    if (!functionCall) {
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

module.exports = { generateAIResponse, generateAIResponseStream, generateVector, searchMemoryTool }

