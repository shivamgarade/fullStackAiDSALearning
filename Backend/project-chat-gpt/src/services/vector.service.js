const { Pinecone } = require('@pinecone-database/pinecone')

const pc = new Pinecone({
  apiKey: process.env.PINECONE_API_KEY
})

const projectChatGPTIndex = pc.Index('project-chat-gpt')

// save vector in pinecone
async function createMemory({ vectors, metadata, messageId }) {

    const dataToPinecone = [
        {
            id: messageId,
            values: vectors,
            metadata
        }
    ]
    await projectChatGPTIndex.upsert({ records: dataToPinecone })
}

async function queryMemory({ queryVector, limit = 5, metadata }) {
    const data = await projectChatGPTIndex.query({
        vector: queryVector,
        topK: limit,
        filter: metadata && Object.keys(metadata).length > 0 ? metadata : undefined,
        includeMetadata: true
    })
    return data.matches;
}

module.exports = { createMemory, queryMemory }