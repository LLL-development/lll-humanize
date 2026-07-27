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

  /** Analyze text. Every signal is 0..1 where higher = more machine-like.
   *  `reliability` reflects how much text we actually had to work with. */
  function analyze(text) {
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
      },
    };
  }

  return { analyze, splitSentences, words };
});
