/* LLL Humanize — AI-writing signal analysis
 * Stylometric signals only. Deliberately reports signals, not a verdict:
 * no reliable verdict exists, and this tool is honest about that.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.Detector = api;
})(typeof self !== "undefined" ? self : this, function () {
  function splitSentences(text) {
    return text
      .split(/(?<=[.!?…。！？])\s+|\n+/u)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
  }

  function words(text) {
    return (text.match(/[\p{L}\p{N}]+(?:'[\p{L}]+)?/gu) || []).map((w) => w.toLowerCase());
  }

  const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
  const stdev = (a) => {
    if (a.length < 2) return 0;
    const m = mean(a);
    return Math.sqrt(a.reduce((s, x) => s + (x - m) * (x - m), 0) / (a.length - 1));
  };

  const HEDGE_PHRASES = [
    "it is important to note", "it's important to note", "in conclusion", "furthermore",
    "moreover", "additionally", "delve", "delves", "tapestry", "in today's world",
    "plays a crucial role", "plays a vital role", "it is worth noting", "overall,",
    "in summary", "navigate the complexities", "ever-evolving", "landscape of",
  ];

  const clamp01 = (x) => Math.min(Math.max(x, 0), 1);

  /** Burstiness on a list of sentence lengths: low variation → machine-like. */
  function lengthUniformity(lens) {
    const cv = mean(lens) > 0 ? stdev(lens) / mean(lens) : 0;
    return 1 - Math.min(cv / 0.65, 1);
  }

  /** Occurrences of any phrase in `list`, normalised per ~4 sentences. */
  function phraseDensity(text, list, sentenceCount) {
    let hits = 0;
    for (const p of list) {
      let idx = 0;
      while ((idx = text.indexOf(p, idx)) !== -1) { hits++; idx += p.length; }
    }
    return { hits, value: Math.min(hits / Math.max(sentenceCount / 4, 1), 1) };
  }

  const countMatches = (text, re) => (text.match(re) || []).length;

  // ---------- script detection ----------
  const RE_LATIN = /\p{Script=Latin}/gu;
  const RE_KANA = /[\p{Script=Hiragana}\p{Script=Katakana}]/gu;
  const RE_HAN = /\p{Script=Han}/gu;

  /** Main script of the text: "latin" | "japanese" | "chinese".
   *  Japanese and Chinese both use Han; kana is what tells them apart. */
  function detectScript(text) {
    const latin = countMatches(text, RE_LATIN);
    const kana = countMatches(text, RE_KANA);
    const han = countMatches(text, RE_HAN);
    const cjk = kana + han;
    // Latin letters ≈ 5 per word; one CJK char carries roughly a word's worth.
    if (cjk === 0 || cjk * 3 < latin) return "latin";
    return kana / cjk >= 0.1 ? "japanese" : "chinese";
  }

  /** CJK sentences: end at 。！？!? (plus any closing quote), no space required. */
  function splitSentencesCJK(text) {
    return (text.match(/[^。！？!?\n]+(?:[。！？!?]+[」』）)"”]*)?/gu) || [])
      .map((s) => s.trim())
      .filter((s) => charLen(s) > 0);
  }

  /** Length in characters, ignoring whitespace and punctuation. */
  const charLen = (s) => s.replace(/[\s\p{P}\p{S}]/gu, "").length;

  // ---------- Japanese ----------
  const JA_CONNECTIVES = ["しかし", "また", "さらに", "そのため", "このように", "一方で", "結論として"];
  const JA_DESUMASU = /(?:です|ます|でした|ました|ません|ませんでした|でしょう|ましょう)$/u;
  const JA_DEARU = /(?:である|であった|であろう|ではない|だ|だった|だろう)$/u;

  function analyzeJapanese(text) {
    const sents = splitSentencesCJK(text);
    const lens = sents.map(charLen);
    const n = sents.length;

    // 1. Ending uniformity — every sentence closing in the same formal register
    let desumasu = 0, dearu = 0;
    for (const s of sents) {
      const end = s.replace(/[。！？!?」』）)"”\s]+$/u, "");
      if (JA_DESUMASU.test(end)) desumasu++;
      else if (JA_DEARU.test(end)) dearu++;
    }
    const formalShare = n ? Math.max(desumasu, dearu) / n : 0;
    const endingUniformity = clamp01((formalShare - 0.4) / 0.5);

    // 2. Kanji ratio — formal/AI prose leans on Sino-Japanese vocabulary
    const kanji = countMatches(text, RE_HAN);
    const kana = countMatches(text, RE_KANA);
    const kanjiRatio = kanji + kana ? kanji / (kanji + kana) : 0;
    const kanjiSignal = clamp01((kanjiRatio - 0.25) / 0.25);

    // 3. 、 per sentence — long, evenly clause-chained sentences
    const commas = countMatches(text, /[、，]/gu);
    const commaRate = n ? commas / n : 0;
    const commaSignal = clamp01((commaRate - 0.5) / 1.5);

    // 4. Connectives — しかし／また／さらに… at a steady drip
    const conn = phraseDensity(text, JA_CONNECTIVES, n);

    // 5. Sentence length variance in characters
    const uniformity = lengthUniformity(lens);

    const signals = [
      { id: "endingUniformity", value: endingUniformity, weight: 0.25 },
      { id: "kanjiRatio", value: kanjiSignal, weight: 0.15 },
      { id: "commaDensity", value: commaSignal, weight: 0.15 },
      { id: "connectives", value: conn.value, weight: 0.2 },
      { id: "uniformity", value: uniformity, weight: 0.25 },
    ];
    return cjkResult("japanese", text, sents, lens, signals, {
      desumasuEndings: desumasu, dearuEndings: dearu, kanjiRatio,
      commasPerSentence: commaRate, connectives: conn.hits,
    });
  }

  // ---------- Chinese ----------
  const ZH_CONNECTIVES = ["此外", "而且", "因此", "总之", "值得注意的是", "综上所述"];

  function analyzeChinese(text) {
    const sents = splitSentencesCJK(text);
    const lens = sents.map(charLen);
    const n = sents.length;

    // 1. Connectives
    const conn = phraseDensity(text, ZH_CONNECTIVES, n);

    // 2. 的 per sentence — stacked nominal modifiers
    const de = countMatches(text, /的/gu);
    const deRate = n ? de / n : 0;
    const deSignal = clamp01((deRate - 0.5) / 1.5);

    // 3. ，per sentence
    const commas = countMatches(text, /[，,]/gu);
    const commaRate = n ? commas / n : 0;
    const commaSignal = clamp01((commaRate - 0.5) / 1.5);

    // 4. Sentence length variance in characters
    const uniformity = lengthUniformity(lens);

    const signals = [
      { id: "connectives", value: conn.value, weight: 0.3 },
      { id: "deDensity", value: deSignal, weight: 0.2 },
      { id: "commaDensity", value: commaSignal, weight: 0.2 },
      { id: "uniformity", value: uniformity, weight: 0.3 },
    ];
    return cjkResult("chinese", text, sents, lens, signals, {
      dePerSentence: deRate, commasPerSentence: commaRate, connectives: conn.hits,
    });
  }

  function cjkResult(script, text, sents, lens, signals, extra) {
    const chars = charLen(text);
    return {
      script,
      signals,
      composite: signals.reduce((s, x) => s + x.value * x.weight, 0),
      // ~400 CJK characters carry about as much as ~200 English words
      reliability: Math.min(chars / 400, 1) * Math.min(sents.length / 8, 1),
      stats: {
        sentences: sents.length,
        characters: chars,
        meanSentenceLen: mean(lens),
        sentenceLenStdev: stdev(lens),
        sentenceLengths: lens,
        lengthUnit: "characters",
        ...extra,
      },
    };
  }

  /** Analyze text. Every signal is 0..1 where higher = more machine-like.
   *  `reliability` reflects how much text we actually had to work with.
   *  `script` says which signal set was used. */
  function analyze(text) {
    const script = detectScript(text);
    if (script === "japanese") return analyzeJapanese(text);
    if (script === "chinese") return analyzeChinese(text);
    return analyzeLatin(text);
  }

  function analyzeLatin(text) {
    const sents = splitSentences(text);
    const ws = words(text);
    const sentLens = sents.map((s) => words(s).length).filter((n) => n > 0);

    // 1. Burstiness — humans vary sentence length more (low variation → machine-like)
    const cv = mean(sentLens) > 0 ? stdev(sentLens) / mean(sentLens) : 0;
    const uniformity = 1 - Math.min(cv / 0.65, 1);

    // 2. Lexical variety — type-token ratio, window-capped so length doesn't dominate
    const win = ws.slice(0, 220);
    const ttr = win.length ? new Set(win).size / win.length : 0;
    const lowVariety = 1 - Math.min(Math.max((ttr - 0.35) / 0.35, 0), 1);

    // 3. Contractions — AI register tends to avoid them in English
    const contractions = (text.match(/\b\p{L}+'(?:t|s|re|ve|ll|d|m)\b/giu) || []).length;
    const contractionRate = sents.length ? contractions / sents.length : 0;
    const noContractions = 1 - Math.min(contractionRate / 0.6, 1);

    // 4. Stock phrases — the "furthermore/moreover/delve" register
    const lower = text.toLowerCase();
    let hedges = 0;
    for (const p of HEDGE_PHRASES) {
      let idx = 0;
      while ((idx = lower.indexOf(p, idx)) !== -1) { hedges++; idx += p.length; }
    }
    const hedgeDensity = Math.min(hedges / Math.max(sents.length / 4, 1), 1);

    // 5. Repeated sentence openers — parallel-structure habit
    const openers = sents.map((s) => words(s).slice(0, 2).join(" ")).filter(Boolean);
    const openerCounts = {};
    for (const o of openers) openerCounts[o] = (openerCounts[o] || 0) + 1;
    const maxOpener = Math.max(0, ...Object.values(openerCounts));
    const repeatedOpeners = openers.length >= 4 ? Math.min((maxOpener - 1) / (openers.length * 0.4), 1) : 0;

    const signals = [
      { id: "uniformity", value: uniformity, weight: 0.3 },
      { id: "lowVariety", value: lowVariety, weight: 0.2 },
      { id: "noContractions", value: noContractions, weight: 0.15 },
      { id: "hedgeDensity", value: hedgeDensity, weight: 0.2 },
      { id: "repeatedOpeners", value: repeatedOpeners, weight: 0.15 },
    ];

    const composite = signals.reduce((s, x) => s + x.value * x.weight, 0);
    const reliability = Math.min(ws.length / 200, 1) * Math.min(sents.length / 8, 1);

    return {
      script: "latin",
      signals,
      composite,
      reliability,
      stats: {
        sentences: sents.length,
        words: ws.length,
        meanSentenceLen: mean(sentLens),
        sentenceLenStdev: stdev(sentLens),
        ttr,
        contractions,
        stockPhrases: hedges,
        sentenceLengths: sentLens,
        lengthUnit: "words",
      },
    };
  }

  return { analyze, detectScript, splitSentences, splitSentencesCJK, words };
});
