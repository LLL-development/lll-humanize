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
ok(rh.script === "latin" && ra.script === "latin", "English detected as latin script");

console.log("detector.js — Japanese / Chinese");

const jaAI = "人工知能は現代社会において重要な役割を果たしています。しかし、その活用には様々な課題が存在します。また、倫理的な観点からの検討も必要不可欠です。さらに、技術の急速な発展に伴い、新たな規制の整備が求められています。そのため、企業や政府は緊密に連携して対策を講じる必要があります。一方で、人工知能は医療や教育の分野において大きな可能性を秘めています。このように、人工知能の影響は多岐にわたります。結論として、人工知能との適切な共存が今後の重要な課題となります。";
const jaHuman = "昨日さ、駅前の新しいラーメン屋行ってみた。めっちゃ並んでたけど、まあいっか。で、食べたらびっくり！スープが濃すぎて全部は無理だったわ。友達は「うまい」って言ってたけどね。値段も千二百円って高くない？たぶんもう行かないかな。でも餃子はよかったよ。次は別の店にしよう。";
const zhAI = "人工智能在现代社会中发挥着重要的作用。此外，人工智能的发展也带来了许多新的挑战，例如数据隐私和算法偏见等问题。而且，各国政府正在积极制定相关的政策和法规。因此，企业需要在技术创新与社会责任之间找到合理的平衡。值得注意的是，人工智能在医疗和教育领域的应用前景十分广阔。综上所述，人工智能是推动社会进步的重要力量。总之，我们应当以开放和审慎的态度迎接人工智能时代的到来。";
const zhHuman = "昨天去了趟超市。人超多！排队排了快半小时，烦死了。我妈非要买那个打折的西瓜，结果回家一切，全是白的。哈哈。我爸说下次他去挑。算了吧，他上次买的更离谱。晚上随便煮了个面，吃完就睡了。";

ok(D.detectScript(jaAI) === "japanese" && D.detectScript(jaHuman) === "japanese", "Japanese script detected (kana present)");
ok(D.detectScript(zhAI) === "chinese" && D.detectScript(zhHuman) === "chinese", "Chinese script detected (Han, no kana)");
ok(D.detectScript("Plain English sentence with one 字.") === "latin", "mostly-Latin text stays latin");
ok(D.splitSentencesCJK("今日は晴れです。明日は雨！本当？").length === 3, "CJK sentences split without spaces");

const rjA = D.analyze(jaAI), rjH = D.analyze(jaHuman);
ok(rjA.script === "japanese", "analyze() returns script = japanese");
ok(rjA.composite > rjH.composite, "formal AI-style Japanese scores above casual Japanese");
ok(rjA.stats.desumasuEndings === rjA.stats.sentences, "every です/ます ending counted");
ok(rjA.stats.connectives >= 6, "Japanese connectives counted");
const jaIds = rjA.signals.map((s) => s.id);
ok(["endingUniformity", "kanjiRatio", "commaDensity", "connectives", "uniformity"].every((id) => jaIds.includes(id)), "Japanese signal set used");

const rzA = D.analyze(zhAI), rzH = D.analyze(zhHuman);
ok(rzA.script === "chinese", "analyze() returns script = chinese");
ok(rzA.composite > rzH.composite, "formal AI-style Chinese scores above casual Chinese");
ok(rzA.stats.connectives >= 6, "Chinese connectives counted");
const zhIds = rzA.signals.map((s) => s.id);
ok(["connectives", "deDensity", "commaDensity", "uniformity"].every((id) => zhIds.includes(id)), "Chinese signal set used");

const inUnit = (x) => x >= 0 && x <= 1;
ok([rjA, rjH, rzA, rzH].every((r) => r.signals.every((s) => inUnit(s.value)) && inUnit(r.composite) && inUnit(r.reliability)), "CJK signals, composite, reliability bounded 0..1");
const wsum = (r) => r.signals.reduce((s, x) => s + x.weight, 0);
ok(Math.abs(wsum(rjA) - 1) < 1e-9 && Math.abs(wsum(rzA) - 1) < 1e-9, "CJK weights sum to 1");
ok(D.analyze("短い文です。").reliability < 0.1, "very short Japanese text flagged as unreliable");

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
