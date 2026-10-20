const { GoogleGenAI } = require("@google/genai");

const ai = new GoogleGenAI({});

async function generateAIResponse({ history = [], prompt, systemInstruction }) {
  const steps = [
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

  const interaction = await ai.interactions.create({
    model: "gemini-3.5-flash-lite",
    input: steps,
    system_instruction: systemInstruction || undefined,
    store: false,
  });

  return interaction.output_text;
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

module.exports = {generateAIResponse,generateVector}
