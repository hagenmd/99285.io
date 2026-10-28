// Local preview without Vercel: ANTHROPIC_API_KEY=sk-... npm run dev  → http://localhost:3000
import http from "node:http";
import { readFile } from "node:fs/promises";
import handler from "./api/analyze.js";

http.createServer(async (req, res) => {
  if (req.url === "/api/analyze") {
    let raw = ""; for await (const c of req) raw += c;
    try { req.body = JSON.parse(raw || "{}"); } catch { req.body = {}; }
    res.status = code => { res.statusCode = code; return res; };
    res.json = obj => { res.setHeader("content-type", "application/json"); res.end(JSON.stringify(obj)); };
    return handler(req, res);
  }
  res.setHeader("content-type", "text/html; charset=utf-8");
  res.end(await readFile(new URL("./index.html", import.meta.url)));
}).listen(3000, () => console.log("http://localhost:3000"));
