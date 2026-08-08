import assert from "node:assert/strict";
import { buildLetteringSvg, normalizeDialogueLines } from "../server/bookBuilder.js";

const legacy = normalizeDialogueLines(undefined, "Kai: Why it feel like it know me?\nMalik: He late.", ["Kai", "Malik"]);
assert.deepEqual(legacy.map((line) => line.text), ["Why it feel like it know me?", "He late."]);
assert.deepEqual(legacy.map((line) => line.speaker), ["Kai", "Malik"]);

const structured = normalizeDialogueLines([
  { speaker: "Nia", text: "NIA: Kai, duck!", bubbleStyle: "shout", balloonAnchor: "top-right" },
  { speaker: "Kai", text: "I see it & I moving!" },
], "", ["Kai", "Nia"]);
assert.equal(structured[0].text, "Kai, duck!");

const svg = buildLetteringSvg({ width: 1200, height: 1800, dialogueLines: structured, narration: "Inside the gayelle.", soundEffect: "KRAK", fontFamily: "Noto Sans" });
assert.match(svg, />Kai, duck!</);
assert.match(svg, /I moving!/);
assert.doesNotMatch(svg, />NIA:/i);
assert.doesNotMatch(svg, />Kai:/i);
assert.match(svg, /&amp;/);
assert.match(svg, /KRAK/);
console.log("BOOK BUILDER LETTERING CONTRACT PASS");
