import { config } from "dotenv"
import { ChatGoogleGenerativeAI } from "@langchain/google-genai"
import { PromptTemplate } from "@langchain/core/prompts"

config()

const model = new ChatGoogleGenerativeAI({
    model: "gemini-3.5-flash-lite",
    apiKey: process.env.GEMINI_API_KEY
})

const prompTemplate = PromptTemplate.fromTemplate(`
    you are a helpful assistant.
    Answer this question {question}
    avoid unnecessary jargon make the answer as consise as possible
    `)

prompTemplate.invoke({ question: "what is express in backend." }).then(respone => { console.log(respone.value) })

