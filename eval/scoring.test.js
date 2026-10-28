// Checks the deterministic scoring rules (no API calls). Run: npm test
import assert from "node:assert/strict";
import { score, scoreData, scoreLevel } from "../lib/mdm.js";

const empty = { tests: [], external_notes: [], independent_historian: { present: false }, independent_interpretations: [], external_discussions: [] };
const t = n => Array.from({ length: n }, (_, i) => ({ name: "test" + i, evidence: "x" }));
const interp = [{ test: "ECG", evidence: "x" }];
const disc = [{ with_whom: "cardiology", evidence: "x" }];

assert.equal(scoreData(empty).rank, 0, "no data = minimal");
assert.equal(scoreData({ ...empty, tests: t(2) }).rank, 1, "2 tests = limited");
assert.equal(scoreData({ ...empty, independent_historian: { present: true } }).rank, 1, "historian alone = limited");
assert.equal(scoreData({ ...empty, tests: t(3) }).rank, 2, "3 tests = moderate (category 1)");
assert.equal(scoreData({ ...empty, tests: t(2), independent_historian: { present: true } }).rank, 2, "2 tests + historian = moderate");
assert.equal(scoreData({ ...empty, independent_interpretations: interp }).rank, 2, "interpretation alone = moderate (category 2)");
assert.equal(scoreData({ ...empty, external_discussions: disc }).rank, 2, "discussion alone = moderate (category 3)");
assert.equal(scoreData({ ...empty, tests: t(3), independent_interpretations: interp }).rank, 3, "cat 1 + cat 2 = extensive");
assert.equal(scoreData({ ...empty, independent_interpretations: interp, external_discussions: disc }).rank, 3, "cat 2 + cat 3 = extensive");
assert.equal(scoreData({ ...empty, tests: [{ name: "Troponin", evidence: "a" }, { name: "troponin ", evidence: "b" }] }).rank, 0, "repeat troponin counts once");

assert.equal(scoreLevel(3, 3, 0).code, "99285", "two highs = 99285");
assert.equal(scoreLevel(3, 1, 2).code, "99284", "high / low / moderate = moderate");
assert.equal(scoreLevel(0, 3, 0).code, "99282", "one high element alone doesn't carry the level");
assert.throws(() => score(undefined), /incomplete MDM extraction/i, "incomplete model output is rejected clearly");
console.log("All scoring tests passed.");
