import { analyze, MAX_CHARS } from "../lib/mdm.js";

// Note text is never logged or stored.
export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Use POST." });
  }
  const note = typeof req.body?.note === "string" ? req.body.note.trim() : "";
  if (note.length < 40) return res.status(400).json({ error: "Paste at least a few sentences of MDM." });
  if (note.length > MAX_CHARS) return res.status(400).json({ error: `Keep the text under ${MAX_CHARS.toLocaleString()} characters.` });

  try {
    const result = await analyze(note, {
      apiKey: process.env.ANTHROPIC_API_KEY,
      model: process.env.MODEL
    });
    return res.status(200).json(result);
  } catch (err) {
    console.error("analyze failed:", err.message); // message only, never the note
    return res.status(502).json({ error: "The analysis service didn't respond. Try again in a minute." });
  }
}
