const { GoogleGenAI } = require("@google/genai");

const ai = new GoogleGenAI({});

// async function generateGoogleAiResponse({history,prompt}) {
//   const interaction = await ai.interactions.create({
//     model: "gemini-3.5-flash-lite",
//     input:history,
//     store:false
//   });

//   return interaction.output_text;
// }

async function generateAIResponse({ history = [], prompt }) {
  const contents = [
    ...history,
    {
      role: "user",
      parts: [{ text: prompt }],
    },
  ];

  const response = await ai.models.generateContent({
    model: "gemini-3.5-flash-lite",
    contents,
  });

  return response.text;
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
