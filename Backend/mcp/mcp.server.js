import { McpServer } from "@modelcontextprotocol/server";
import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";
import { z } from "zod";

const server = new McpServer({
  name: "demo-server",
  version: "1.0.0",
});

server.registerTool(
  "add",
  {
    title: "Addition Tool",
    description: "Add two numbers",
    inputSchema: z.object({
      a: z.number().describe("The first number"),
      b: z.number().describe("The second number"),
    }),
  },
  async ({ a, b }) => {
    return { content: [{ type: "text", text: String(a + b) }] };
  },
);

// transport - how mcp gonna communicate with server
const transport = new StdioServerTransport();
await server.connect(transport);
