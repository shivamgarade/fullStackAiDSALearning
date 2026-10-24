import { config } from "dotenv";
import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import { GoogleGenAI } from "@google/genai";
config();

const ai = new GoogleGenAI({});

const tools = [];

const transport = new StdioClientTransport({
  command: "node",
  args: ["./mcp.server.js"],
});

const client = new Client({
  name: "example-client",
  version: "1.0.0",
});

await client.connect(transport);

client.listTools().then(async (response) => {
  response.tools.forEach((tool) => {
    tools.push({
      type: "function",
      name: tool.name,
      description: tool.description,
      parameters: {
        type: "OBJECT",
        properties: tool.inputSchema.properties,
        required: tool.inputSchema.required || [],
      },
    });
  });

  const interaction = await ai.interactions.create({
    model: "gemini-3.5-flash-lite",
    input: "add 2 and 3",
    tools,
  });

  for (const step of interaction.steps) {
    if (step.type === "function_call") {
      console.log(`Function to call: ${step.name}`);
      console.log(`Arguments: ${JSON.stringify(step.arguments)}`);
    }
  }

  for (const step of interaction.steps) {
    if (step.type !== "function_call") continue;

    const result = await client.callTool({
      name: step.name,
      arguments: step.arguments,
    });

    const resultText = result.content
      .filter((item) => item.type === "text")
      .map((item) => item.text)
      .join("\n");

    // Ask Gemini to turn the tool result into a user-facing response.
    const finalResponse = await ai.interactions.create({
      model: "gemini-3.5-flash-lite",
      previous_interaction_id: interaction.id,
      input: `The ${step.name} tool returned: ${resultText}. Give the user the answer.`,
    });

    console.log("AI Response:", finalResponse.output_text);
  }
});
