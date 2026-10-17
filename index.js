
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createServer } from "node:http";
import { z } from "zod";

function createLoanEssyServer() {
  const server = new McpServer({
    name: "loanessy-calculator",
    version: "1.0.0",
  });

  server.registerTool(
    "calculate_loan_payment",
    {
      title: "Calculate Loan Payment",
      description:
        "Estimate a US loan's monthly payment, total payments, and total interest.",
      inputSchema: {
        amount: z.number().positive().describe("Loan amount in USD"),
        apr: z.number().min(0).max(100).describe("Annual APR percentage"),
        months: z.number().int().positive().max(600).describe("Loan term in months"),
      },
    },
    async ({ amount, apr, months }) => {
      const rate = apr / 100 / 12;
      const payment =
        rate === 0
          ? amount / months
          : (amount * rate) / (1 - Math.pow(1 + rate, -months));

      const total = payment * months;
      const money = (n) =>
        new Intl.NumberFormat("en-US", {
          style: "currency",
          currency: "USD",
        }).format(n);

      return {
        content: [
          {
            type: "text",
            text: [
              `Estimated monthly payment: ${money(payment)}`,
              `Total payments: ${money(total)}`,
              `Total interest: ${money(total - amount)}`,
              "Estimates only; actual lender fees and terms may differ.",
            ].join("\n"),
          },
        ],
      };
    }
  );

  return server;
}

const httpServer = createServer(async (req, res) => {
  if (req.url === "/health" && req.method === "GET") {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("LoanEssy MCP server is running");
    return;
  }

if (new URL(req.url, "http://localhost").pathname !== "/mcp") {    res.writeHead(404);
    res.end("Not found");
    return;
  }

  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
      "Access-Control-Allow-Headers":
        "Content-Type, mcp-session-id, mcp-protocol-version, authorization",
    });
    res.end();
    return;
  }

  const server = createLoanEssyServer();
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  });

  try {
    await server.connect(transport);
    await transport.handleRequest(req, res);
  } catch (error) {
    console.error("MCP request failed:", error);
    if (!res.headersSent) {
      res.writeHead(500, { "Content-Type": "text/plain" });
      res.end("Internal server error");
    }
  } finally {
    await transport.close().catch(() => {});
    await server.close().catch(() => {});
  }
});

httpServer.listen(process.env.PORT || 3000, "0.0.0.0", () => {
  console.log("LoanEssy MCP server running at http://localhost:3000/mcp");
  console.log("Health check: http://localhost:3000/health");
});
