# 99285.io

Paste ED medical decision making (MDM) and see which ED E/M level (99282–99285) the documentation supports, with quoted evidence for each element and a list of documentation gaps.

## How it works

1. The model reads the note and extracts the three MDM elements (problems, data, risk), each with verbatim quotes. It does not choose the level.
2. `lib/mdm.js` counts the data items, scores the data element, and applies the 2-of-3 rule in code.

This keeps the output auditable and makes errors traceable to a specific element.

## Files

| Path | Purpose |
|---|---|
| `index.html` | The page |
| `api/analyze.js` | Serverless endpoint (Vercel) |
| `lib/mdm.js` | Prompt, schema, and scoring |
| `eval/scoring.test.js` | Tests for the scoring rules (`npm test`) |
| `eval/run.js` | Accuracy, weighted kappa, and confusion matrix against labeled vignettes (`npm run eval`) |
| `eval/vignettes.jsonl` | Seed vignettes; grow to 100 |
| `server-local.js` | Local preview without Vercel |

## Run locally

```
export ANTHROPIC_API_KEY=sk-ant-...
npm test
npm run dev          # http://localhost:3000
npm run eval         # runs eval/vignettes.jsonl
```

## Deploy to 99285.io

1. Create a GitHub repo and push this folder.
2. In Vercel, import the repo. No build settings are needed.
3. In Project Settings → Environment Variables, add `ANTHROPIC_API_KEY`. Optional: `MODEL` to override the default model.
4. Deploy, then confirm the `.vercel.app` URL works.
5. In Project Settings → Domains, add `99285.io` and `www.99285.io`. Enter the DNS records Vercel shows at your registrar (or point the domain's nameservers to Vercel).
6. In the Anthropic Console, set a monthly spend limit. The endpoint is public.

## Notes

- Synthetic or de-identified text only. Note text is never logged by the endpoint.
- If the API rejects `temperature` for the chosen model, remove that line in `lib/mdm.js`.
- Educational tool, not coding advice. CPT® is a registered trademark of the AMA.
