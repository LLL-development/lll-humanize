/* Run: node tests/core.test.js */
const P = require("../plagiarism.js");
const D = require("../detector.js");

let pass = 0, fail = 0;
function ok(cond, name) {
  if (cond) { pass++; console.log("  ✓ " + name); }
  else { fail++; console.error("  ✗ " + name); }
}

console.log("plagiarism.js");

// tokenize
const t = P.tokenize("Hello, World! 123");
ok(t.length === 3 && t[0].w === "hello" && t[2].w === "123", "tokenize lowercases and keeps numbers");
ok(t[1].start === 7 && t[1].end === 12, "tokenize preserves char offsets");

// CJK tokenization
const tc = P.tokenize("我爱猫 and dogs");
ok(tc[0].w === "我" && tc[1].w === "爱" && tc[3].w === "and", "CJK splits per character, Latin per word");
ok(P.isMostlyCJK("这是一段中文文本用来测试"), "isMostlyCJK true for Chinese");
ok(!P.isMostlyCJK("this is english text"), "isMostlyCJK false for English");

// jaccard basics
ok(P.jaccard(new Set(["a", "b"]), new Set(["a", "b"])) === 1, "jaccard identical = 1");
ok(P.jaccard(new Set(["a"]), new Set(["b"])) === 0, "jaccard disjoint = 0");
ok(P.jaccard(new Set(), new Set()) === 0, "jaccard empty = 0 (no NaN)");

// mergeRanges
const merged = P.mergeRanges([[0, 5], [3, 8], [10, 12]]);
ok(JSON.stringify(merged) === "[[0,8],[10,12]]", "mergeRanges merges overlaps");

// identical texts
const same = "The quick brown fox jumps over the lazy dog near the river bank today.";
const rSame = P.compare(same, same);
ok(rSame.jaccard === 1, "identical texts jaccard = 1");
ok(rSame.coverageA > 0.9, "identical texts near-full coverage");

// clean pair
const rClean = P.compare(
  "Photosynthesis converts sunlight into chemical energy stored inside glucose molecules within plant cells.",
  "The stock market fell sharply on Tuesday after unexpected inflation figures surprised many investors."
);
ok(rClean.jaccard === 0, "unrelated texts jaccard = 0");
ok(rClean.rangesA.length === 0, "unrelated texts produce no highlight ranges");

// partial copy — one sentence lifted into different surroundings
const src = "Machine learning models require large amounts of training data to perform well. This is a known limitation of the field.";
const copy = "In my opinion the situation is clear. Machine learning models require large amounts of training data to perform well. Everyone should remember that.";
const rCopy = P.compare(src, copy);
ok(rCopy.containmentA > 0.3, "lifted sentence detected by containment");
ok(rCopy.rangesB.length >= 1, "lifted sentence produces highlight range in target");
const hl = copy.slice(rCopy.rangesB[0][0], rCopy.rangesB[0][1]);
ok(hl.includes("Machine learning models require"), "highlight range lands on the copied span");

// paraphrase scores between clean and copy
const para = "To work well, ML systems need very big training datasets. The field knows this weakness.";
const rPara = P.compare(src, para);
ok(rPara.jaccard < rCopy.jaccard, "paraphrase scores below direct copy");

// CJK copy detection
const zhA = "机器学习模型需要大量的训练数据才能表现良好，这是该领域公认的局限性之一。";
const zhB = "众所周知，机器学习模型需要大量的训练数据才能表现良好。";
const rZh = P.compare(zhA, zhB);
ok(rZh.cjk === true && rZh.k === 8, "CJK detected, char shingles k=8");
ok(rZh.containmentB > 0.2 && rZh.rangesB.length >= 1, "CJK copied span detected");

console.log("detector.js");

const humanText = "Honestly? I didn't expect much. But the tiny shop at the corner — the one with the crooked sign — sold the best noodles I've had all year. Ten ringgit. Unreal. My brother didn't believe me until he tried them himself, and now he won't stop talking about it either.";
const aiText = "It is important to note that machine learning plays a crucial role in modern technology. Furthermore, machine learning enables systems to improve automatically. Moreover, machine learning provides valuable insights across industries. Additionally, machine learning supports decision making in complex environments. In conclusion, machine learning represents a transformative force in today's world.";

const rh = D.analyze(humanText);
const ra = D.analyze(aiText);
ok(ra.composite > rh.composite, "stock-phrase parallel text scores above bursty human text");
ok(ra.stats.stockPhrases >= 4, "stock phrases counted");
ok(rh.stats.contractions >= 3, "contractions counted in human text");
ok(rh.reliability >= 0 && rh.reliability <= 1, "reliability bounded");

const short = D.analyze("Too short.");
ok(short.reliability < 0.1, "very short text flagged as unreliable");

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
