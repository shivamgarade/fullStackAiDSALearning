const { GoogleGenAI } = require("@google/genai");

const client = new GoogleGenAI({
  apiKey: process.env.GEMINI_KEY
});


async function generateResponse(prompt){
    const response = await client.models.generateContent({
    model: "gemini-3.5-flash-lite",
    contents: prompt,
    config: {
      systemInstruction: 'You are a helpful assistant. You should answer user queries in a concise and helpful manner. Also always respond in the same language as the user.'
    }
  });

  return response.text;


} 

module.exports = { generateResponse }