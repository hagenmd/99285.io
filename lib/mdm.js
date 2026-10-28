// Core logic for 99285.io
// The LLM extracts MDM elements with quoted evidence.
// Code (not the LLM) counts data items and applies the 2-of-3 rule.

const API_URL = "https://api.anthropic.com/v1/messages";
const DEFAULT_MODEL = "claude-sonnet-5-5";
export const MAX_CHARS = 12000;

export const RANKS = ["minimal", "low", "moderate", "high"];
export const MDM_NAMES = ["Straightforward", "Low", "Moderate", "High"];
export const CODES = ["99282", "99283", "99284", "99285"];
const DATA_NAMES = ["Minimal or none", "Limited", "Moderate", "Extensive"];

const SYSTEM_PROMPT = `You review emergency department medical decision making (MDM) documentation and extract the three MDM elements used for ED E/M level selection (2023 AMA framework). You only extract what is documented. You never infer work that is not written.

PROBLEMS (number and complexity of problems addressed):
- minimal: one self-limited or minor problem.
- low: two or more self-limited/minor problems; one stable chronic illness; one acute uncomplicated illness or injury; one stable acute illness.
- moderate: chronic illness with exacerbation, progression, or treatment side effects; two or more stable chronic illnesses; an undiagnosed new problem with uncertain prognosis; acute illness with systemic symptoms; acute complicated injury.
- high: chronic illness with severe exacerbation, progression, or treatment side effects; acute or chronic illness or injury posing a threat to life or bodily function.
A problem is "addressed" only if it was evaluated or treated in this encounter. A differential that includes life threats that were considered and evaluated supports a threat-to-life classification when the documentation shows them being worked up.

DATA (extract items; do not assign a level, code will score it):
- tests: each UNIQUE test (unique by CPT code, e.g. CBC = one, BMP = one, troponin = one even if repeated in the same encounter) that was ordered and/or had its result reviewed. Ordering includes reviewing its result; list the test once.
- external_notes: each unique EXTERNAL source of prior records reviewed (outside facility records, PCP notes, prior admission from another system).
- independent_historian: true only if history was obtained from someone other than the patient because the patient could not provide a reliable history (e.g., family, EMS, caregiver) and the note says so.
- independent_interpretations: tests the documenting clinician personally interpreted (e.g., "my read of the ECG", "I independently viewed the CT"). Exclude tests the clinician bills separately for interpreting if the note says so.
- external_discussions: discussions of management or test interpretation with an external physician/QHP/appropriate source (consultant, PCP, hospitalist, case manager). Not merely "consult placed".

RISK (of complications/morbidity of patient management):
- minimal: rest, gargles, superficial dressings, minimal-risk testing.
- low: OTC drugs, minor procedures without risk factors, low-risk management.
- moderate: prescription drug management; decision on minor surgery with risk factors; decision on elective major surgery without risk factors; diagnosis or treatment significantly limited by social determinants of health.
- high: drug therapy requiring intensive monitoring for toxicity; decision on emergency major surgery or elective major surgery with risk factors; decision regarding hospitalization or escalation to hospital-level care (including observation); decision not to resuscitate or to de-escalate because of poor prognosis; parenteral controlled substances.

EVIDENCE: every classification and every data item must carry a short verbatim quote from the note. If you cannot quote it, do not count it.

GAPS: list places where the note indicates work was likely done but the documentation is incomplete (e.g., "ECG obtained but no interpretation documented", "admission discussed but decision not stated"). Phrase each gap as what is missing from the documentation. Never suggest performing additional tests, treatments, or consultations, and never frame a gap in terms of reaching a higher level.

PHI: set phi_suspected true if the text appears to contain real identifiers (names, dates of birth, MRNs, addresses, phone numbers).

Return your answer only by calling the record_mdm tool.`;

const evidence = { type: "string", description: "Short verbatim quote from the note" };
const level = { type: "string", enum: RANKS };

const TOOL = {
  name: "record_mdm",
  description: "Record the extracted MDM elements.",
  input_schema: {
    type: "object",
    properties: {
      problems: {
        type: "object",
        properties: {
          level,
          basis: { type: "string", description: "Which problem category applies, in a few words" },
          evidence: { type: "array", items: evidence }
        },
        required: ["level", "basis", "evidence"]
      },
      data: {
        type: "object",
        properties: {
          tests: { type: "array", items: { type: "object", properties: { name: { type: "string" }, evidence }, required: ["name", "evidence"] } },
          external_notes: { type: "array", items: { type: "object", properties: { source: { type: "string" }, evidence }, required: ["source", "evidence"] } },
          independent_historian: { type: "object", properties: { present: { type: "boolean" }, evidence: { type: "string" } }, required: ["present"] },
          independent_interpretations: { type: "array", items: { type: "object", properties: { test: { type: "string" }, evidence }, required: ["test", "evidence"] } },
          external_discussions: { type: "array", items: { type: "object", properties: { with_whom: { type: "string" }, evidence }, required: ["with_whom", "evidence"] } }
        },
        required: ["tests", "external_notes", "independent_historian", "independent_interpretations", "external_discussions"]
      },
      risk: {
        type: "object",
        properties: {
          level,
          basis: { type: "string", description: "Which risk category applies, in a few words" },
          evidence: { type: "array", items: evidence }
        },
        required: ["level", "basis", "evidence"]
      },
      gaps: { type: "array", items: { type: "string" } },
      phi_suspected: { type: "boolean" }
    },
    required: ["problems", "data", "risk", "gaps", "phi_suspected"]
  }
};

// Deterministic data scoring from extracted items.
export function scoreData(data) {
  const tests = dedupe(data.tests, "name");
  const notes = dedupe(data.external_notes, "source");
  const historian = data.independent_historian?.present ? 1 : 0;
  const interps = (data.independent_interpretations || []).length;
  const discussions = (data.external_discussions || []).length;

  const cat1Items = tests + notes + historian;
  const cat1Moderate = cat1Items >= 3;
  const cat2 = interps >= 1;
  const cat3 = discussions >= 1;
  const categoriesMet = [cat1Moderate, cat2, cat3].filter(Boolean).length;

  let rank = 0;
  if (categoriesMet >= 2) rank = 3;
  else if (categoriesMet === 1) rank = 2;
  else if (tests + notes >= 2 || historian) rank = 1;

  return {
    rank,
    label: DATA_NAMES[rank],
    counts: { tests, external_notes: notes, independent_historian: !!historian, independent_interpretations: interps, external_discussions: discussions },
    categories: { category1: cat1Moderate, category2: cat2, category3: cat3 }
  };
}

function dedupe(arr = [], key) {
  return new Set(arr.map(x => String(x[key] || "").trim().toLowerCase()).filter(Boolean)).size;
}

// 2 of 3 elements must meet or exceed a level: the median rank.
export function scoreLevel(problemsRank, dataRank, riskRank) {
  const sorted = [problemsRank, dataRank, riskRank].sort((a, b) => a - b);
  const rank = sorted[1];
  return { rank, mdm: MDM_NAMES[rank], code: CODES[rank] };
}

export function score(extraction) {
  if (!extraction || !extraction.problems || !extraction.risk || !extraction.data) {
    throw new Error("Model returned incomplete MDM extraction.");
  }

  const p = RANKS.indexOf(extraction.problems.level);
  const r = RANKS.indexOf(extraction.risk.level);
  const d = scoreData(extraction.data);
  const final = scoreLevel(p, d.rank, r);
  return {
    level: final,
    elements: {
      problems: { rank: p, label: MDM_NAMES[p], basis: extraction.problems.basis, evidence: extraction.problems.evidence },
      data: { ...d, items: extraction.data },
      risk: { rank: r, label: MDM_NAMES[r], basis: extraction.risk.basis, evidence: extraction.risk.evidence }
    },
    gaps: extraction.gaps || [],
    phi_suspected: !!extraction.phi_suspected
  };
}

export async function extract(note, { apiKey, model } = {}) {
  const basePayload = {
    model: model || DEFAULT_MODEL,
    max_tokens: 4000,
    system: SYSTEM_PROMPT,
    tools: [TOOL],
    tool_choice: { type: "tool", name: "record_mdm" },
    messages: [{ role: "user", content: `<note>\n${note}\n</note>` }]
  };

  async function call(payload) {
    const res = await fetch(API_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify(payload)
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Model request failed (${res.status}): ${body.slice(0, 300)}`);
    }
    return res.json();
  }

  let json;
  try {
    json = await call(basePayload);
  } catch (err) {
    const body = String(err.message || "");
    if (body.includes("tool_choice") && body.includes("not supported")) {
      json = await call({ ...basePayload, tool_choice: { type: "auto" } });
    } else {
      throw err;
    }
  }

  const block = (json.content || []).find(b => b.type === "tool_use");
  if (!block) throw new Error("Model returned no structured result");
  if (!block.input) throw new Error("Model returned an empty structured result");
  return block.input;
}

export async function analyze(note, opts) {
  const extraction = await extract(note, opts);
  return score(extraction);
}
