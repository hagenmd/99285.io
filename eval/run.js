// Runs labeled vignettes through the tool and reports agreement with gold labels.
// Usage: ANTHROPIC_API_KEY=sk-... npm run eval
// Each line of vignettes.jsonl:
// {"id":"v001","text":"...","gold":{"level":"99284","problems":"moderate","data":"moderate","risk":"high"}}
// gold.data uses: minimal | limited | moderate | extensive
import { readFile, writeFile } from "node:fs/promises";
import { analyze, CODES, RANKS } from "../lib/mdm.js";

const file = process.argv[2] || "eval/vignettes.jsonl";
const rows = (await readFile(file, "utf8")).split("\n").filter(l => l.trim()).map(l => JSON.parse(l));
const DATA_RANKS = ["minimal", "limited", "moderate", "extensive"];
const results = [];

for (const row of rows) {
  try {
    const r = await analyze(row.text, { apiKey: process.env.ANTHROPIC_API_KEY, model: process.env.MODEL });
    results.push({
      id: row.id,
      level: [CODES.indexOf(row.gold.level), r.level.rank],
      problems: [RANKS.indexOf(row.gold.problems), r.elements.problems.rank],
      data: [DATA_RANKS.indexOf(row.gold.data), r.elements.data.rank],
      risk: [RANKS.indexOf(row.gold.risk), r.elements.risk.rank],
      output: r
    });
    process.stdout.write(".");
  } catch (e) {
    console.error(`\n${row.id}: ${e.message}`);
  }
}

const acc = p => p.filter(([g, x]) => g === x).length / p.length;

// Quadratic weighted kappa over 4 ordinal categories
function qwk(p, k = 4) {
  const O = Array.from({ length: k }, () => Array(k).fill(0));
  p.forEach(([g, x]) => O[g][x]++);
  const n = p.length;
  const rowS = O.map(r => r.reduce((a, b) => a + b, 0));
  const colS = O[0].map((_, j) => O.reduce((a, r) => a + r[j], 0));
  let num = 0, den = 0;
  for (let i = 0; i < k; i++) for (let j = 0; j < k; j++) {
    const w = (i - j) ** 2 / (k - 1) ** 2;
    num += w * O[i][j];
    den += w * rowS[i] * colS[j] / n;
  }
  return den ? 1 - num / den : 1;
}

const lv = results.map(r => r.level);
const cm = Array.from({ length: 4 }, () => Array(4).fill(0));
lv.forEach(([g, x]) => cm[g][x]++);

console.log(`\n\nn = ${lv.length}`);
console.log(`Level accuracy ${(acc(lv) * 100).toFixed(1)}%   weighted kappa ${qwk(lv).toFixed(3)}`);
console.log(`Predicted higher than gold: ${lv.filter(([g, x]) => x > g).length}   lower: ${lv.filter(([g, x]) => x < g).length}`);
for (const el of ["problems", "data", "risk"]) {
  const p = results.map(r => r[el]);
  console.log(`${el.padEnd(9)} accuracy ${(acc(p) * 100).toFixed(1)}%   kappa ${qwk(p).toFixed(3)}`);
}
console.log("\nConfusion matrix (rows = gold, columns = predicted)");
console.log("       " + CODES.map(c => c.padStart(6)).join(""));
cm.forEach((r, i) => console.log(CODES[i] + "  " + r.map(v => String(v).padStart(6)).join("")));

await writeFile("eval/results.json", JSON.stringify(results, null, 2));
console.log("\nPer-case output written to eval/results.json");
