const { GoogleGenAI } = require("@google/genai");

const ai = new GoogleGenAI({});

function formatSteps({ history = [], prompt }) {
  return [
    ...history.map((msg) => {
      if (msg.type && msg.content) {
        return msg;
      }
      const text = msg.content || (msg.parts && msg.parts[0]?.text) || "";
      return {
        type: msg.role === "user" ? "user_input" : "model_output",
        content: [{ type: "text", text }],
      };
    }),
    {
      type: "user_input",
      content: [{ type: "text", text: prompt }],
    },
  ];
}

async function generateAIResponse({ history = [], prompt, systemInstruction }) {
  const steps = formatSteps({ history, prompt });

  const interaction = await ai.interactions.create({
    model: "gemini-3.5-flash-lite",
    input: steps,
    system_instruction: systemInstruction || undefined,
    store: false,
  });

  return interaction.output_text;
}

async function* generateAIResponseStream({ history = [], prompt, systemInstruction }) {
  const steps = formatSteps({ history, prompt });

  const stream = await ai.interactions.create({
    model: "gemini-3.5-flash-lite",
    input: steps,
    system_instruction: systemInstruction || undefined,
    store: false,
    stream: true,
  });

  for await (const event of stream) {
    if (event.event_type === "step.delta" && event.delta?.type === "text") {
      yield event.delta.text;
    }
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

module.exports = { generateAIResponse, generateAIResponseStream, generateVector }
