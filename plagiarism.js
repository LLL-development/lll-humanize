/* LLL Humanize — plagiarism core
 * Pure functions, no DOM. Works in browser (window.Plagiarism) and Node (module.exports).
 * Handles both space-delimited languages (word shingles) and CJK (character tokens).
 */
(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.Plagiarism = api;
})(typeof self !== "undefined" ? self : this, function () {
  const CJK = /[\u3040-\u30ff\u3400-\u9fff\uf900-\ufaff]/;

  /** Tokenize text into lowercase tokens with original char offsets.
   *  Latin/number runs become word tokens; CJK runs are split per character. */
  function tokenize(text) {
    const tokens = [];
    const re = /[\p{L}\p{N}]+/gu;
    let m;
    while ((m = re.exec(text)) !== null) {
      const run = m[0];
      if (CJK.test(run)) {
        for (let i = 0; i < run.length; i++) {
          tokens.push({ w: run[i], start: m.index + i, end: m.index + i + 1 });
        }
      } else {
        tokens.push({ w: run.toLowerCase(), start: m.index, end: m.index + run.length });
      }
    }
    return tokens;
  }

  /** True if the text is predominantly CJK (affects sensible default k). */
  function isMostlyCJK(text) {
    let cjk = 0, letters = 0;
    for (const ch of text) {
      if (/[\p{L}]/u.test(ch)) { letters++; if (CJK.test(ch)) cjk++; }
    }
    return letters > 0 && cjk / letters > 0.5;
  }

  /** Build k-token shingles. Returns array of {key, i} where i = start token index. */
  function shingles(tokens, k) {
    const out = [];
    for (let i = 0; i + k <= tokens.length; i++) {
      let key = tokens[i].w;
      for (let j = 1; j < k; j++) key += "\u0001" + tokens[i + j].w;
      out.push({ key, i });
    }
    return out;
  }

  function jaccard(setA, setB) {
    if (setA.size === 0 && setB.size === 0) return 0;
    let inter = 0;
    const [small, big] = setA.size <= setB.size ? [setA, setB] : [setB, setA];
    for (const s of small) if (big.has(s)) inter++;
    return inter / (setA.size + setB.size - inter);
  }

  /** Containment: what fraction of A's shingles appear in B. Better than Jaccard
   *  when one text is much shorter (e.g. a paragraph lifted from an essay). */
  function containment(setA, setB) {
    if (setA.size === 0) return 0;
    let inter = 0;
    for (const s of setA) if (setB.has(s)) inter++;
    return inter / setA.size;
  }

  /** Merge overlapping/adjacent [start,end] char ranges. */
  function mergeRanges(ranges) {
    if (ranges.length === 0) return [];
    const sorted = ranges.slice().sort((a, b) => a[0] - b[0]);
    const out = [sorted[0].slice()];
    for (let i = 1; i < sorted.length; i++) {
      const last = out[out.length - 1];
      if (sorted[i][0] <= last[1]) last[1] = Math.max(last[1], sorted[i][1]);
      else out.push(sorted[i].slice());
    }
    return out;
  }

  /** Full comparison. Returns scores plus merged char ranges of matched spans
   *  in each text, ready for highlighting. */
  function compare(textA, textB, opts = {}) {
    const cjk = isMostlyCJK(textA) || isMostlyCJK(textB);
    const k = opts.k || (cjk ? 8 : 5);

    const tokA = tokenize(textA);
    const tokB = tokenize(textB);
    const shA = shingles(tokA, k);
    const shB = shingles(tokB, k);
    const setA = new Set(shA.map((s) => s.key));
    const setB = new Set(shB.map((s) => s.key));

    const rangesA = [];
    const rangesB = [];
    for (const s of shA) {
      if (setB.has(s.key)) rangesA.push([tokA[s.i].start, tokA[s.i + k - 1].end]);
    }
    for (const s of shB) {
      if (setA.has(s.key)) rangesB.push([tokB[s.i].start, tokB[s.i + k - 1].end]);
    }

    const mergedA = mergeRanges(rangesA);
    const mergedB = mergeRanges(rangesB);
    const coveredA = mergedA.reduce((n, r) => n + (r[1] - r[0]), 0);
    const coveredB = mergedB.reduce((n, r) => n + (r[1] - r[0]), 0);

    return {
      k,
      cjk,
      jaccard: jaccard(setA, setB),
      containmentA: containment(setA, setB),
      containmentB: containment(setB, setA),
      coverageA: textA.length ? coveredA / textA.length : 0,
      coverageB: textB.length ? coveredB / textB.length : 0,
      rangesA: mergedA,
      rangesB: mergedB,
      tokensA: tokA.length,
      tokensB: tokB.length,
    };
  }

  return { tokenize, isMostlyCJK, shingles, jaccard, containment, mergeRanges, compare };
});
