// Local test server: node scripts/dev-server.js, then connect to http://localhost:3000/mcp
import http from "node:http";
import mcp from "../api/mcp.js";
import index from "../api/index.js";

const port = Number(process.env.PORT || 3000);
http.createServer((req, res) => {
  const path = new URL(req.url, "http://x").pathname;
  if (path === "/mcp" || path === "/api/mcp") return mcp(req, res);
  if (path === "/") return index(req, res);
  res.statusCode = 404;
  res.end("not found");
}).listen(port, () => console.log(`openlawtw MCP on http://localhost:${port}/mcp`));
