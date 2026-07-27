/* LLL Humanize — UI layer. Core logic lives in plagiarism.js / detector.js. */
(function () {
  "use strict";
  const $ = (id) => document.getElementById(id);

  // ---------- i18n ----------
  let lang = localStorage.getItem("lll-humanize-lang") || "ja";
  if (!STRINGS[lang]) lang = "ja";

  function applyStrings() {
    document.querySelectorAll("[data-i18n]").forEach((el) => {
      el.textContent = t(lang, el.dataset.i18n);
    });
    document.documentElement.lang = lang;
    $("langSel").value = lang;
  }
  $("langSel").addEventListener("change", (e) => {
    lang = e.target.value;
    localStorage.setItem("lll-humanize-lang", lang);
    applyStrings();
  });

  // ---------- tabs ----------
  const tabs = [
    ["tab-plag", "panel-plag"],
    ["tab-det", "panel-det"],
    ["tab-hum", "panel-hum"],
  ];
  tabs.forEach(([tabId, panelId]) => {
    $(tabId).addEventListener("click", () => {
      tabs.forEach(([tId, pId]) => {
        $(tId).setAttribute("aria-selected", String(tId === tabId));
        $(pId).classList.toggle("hidden", pId !== panelId);
      });
    });
  });

  // ---------- helpers ----------
  function esc(s) {
    return s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
  }
  function highlight(text, ranges) {
    if (!ranges.length) return esc(text);
    let html = "", pos = 0;
    for (const [a, b] of ranges) {
      html += esc(text.slice(pos, a)) + "<mark>" + esc(text.slice(a, b)) + "</mark>";
      pos = b;
    }
    return html + esc(text.slice(pos));
  }
  const pct = (x) => Math.round(x * 100) + "%";
  function bindCount(taId, outId) {
    const ta = $(taId), out = $(outId);
    const upd = () => (out.textContent = t(lang, "charCount", { n: ta.value.length }));
    ta.addEventListener("input", upd);
    upd();
  }
  function showError(id, msg) { const el = $(id); el.textContent = msg; el.classList.remove("hidden"); }
  function clearError(id) { $(id).classList.add("hidden"); }

  bindCount("srcText", "srcCount");
  bindCount("susText", "susCount");
  bindCount("detText", "detCount");
  bindCount("humText", "humCount");

  // ---------- plagiarism ----------
  $("compareBtn").addEventListener("click", () => {
    clearError("plagError");
    const a = $("srcText").value, b = $("susText").value;
    if (!a.trim() || !b.trim()) return showError("plagError", t(lang, "emptyInput"));

    const r = Plagiarism.compare(a, b);
    const cov = Math.max(r.coverageA, r.coverageB);
    const stamp = $("plagStamp");
    let cls, key;
    if (r.jaccard === 0 && cov === 0) { cls = "none"; key = "verdictNone"; }
    else if (cov < 0.15) { cls = "low"; key = "verdictLow"; }
    else if (cov < 0.5) { cls = "mid"; key = "verdictMid"; }
    else { cls = "high"; key = "verdictHigh"; }
    stamp.className = "stamp " + cls;
    stamp.textContent = t(lang, key);

    $("scoreJaccard").textContent = pct(r.jaccard);
    $("scoreCovA").textContent = pct(r.coverageA);
    $("scoreCovB").textContent = pct(r.coverageB);
    $("docA").innerHTML = highlight(a, r.rangesA);
    $("docB").innerHTML = highlight(b, r.rangesB);
    $("plagMeta").textContent = t(lang, "shingleNote", {
      k: r.k, mode: t(lang, r.cjk ? "modeChar" : "modeWord"),
    });
    $("plagResult").classList.remove("hidden");
  });

  // ---------- detector ----------
  const SAMPLES = {
    en: {
      human: "Honestly? I didn't expect much. But the tiny shop at the corner — the one with the crooked sign — sold the best noodles I've had all year. Ten ringgit. Unreal. My brother didn't believe me until he tried them himself. Now he won't stop talking about it, which is somehow more annoying than when he doubted me. We went back twice last week. The auntie recognizes us already and adds extra fishballs without asking. That's how you know you've made it.",
      ai: "It is important to note that machine learning plays a crucial role in modern technology. Furthermore, machine learning enables systems to improve automatically through experience. Moreover, machine learning provides valuable insights across various industries. Additionally, machine learning supports decision making in complex environments. It is worth noting that machine learning continues to evolve rapidly. In conclusion, machine learning represents a transformative force in today's world.",
    },
  };
  SAMPLES.ja = SAMPLES.en;
  SAMPLES["zh-CN"] = SAMPLES.en;

  $("sampleHumanBtn").addEventListener("click", () => { $("detText").value = (SAMPLES[lang] || SAMPLES.en).human; $("detText").dispatchEvent(new Event("input")); });
  $("sampleAIBtn").addEventListener("click", () => { $("detText").value = (SAMPLES[lang] || SAMPLES.en).ai; $("detText").dispatchEvent(new Event("input")); });

  function runDetector(text) {
    const r = Detector.analyze(text);
    const stamp = $("detStamp");
    const c = r.composite;
    if (c < 0.35) { stamp.className = "stamp none"; stamp.textContent = pct(c); }
    else if (c < 0.6) { stamp.className = "stamp low"; stamp.textContent = pct(c); }
    else { stamp.className = "stamp mid"; stamp.textContent = pct(c); }
    $("detComposite").textContent = pct(c);
    $("detReliability").classList.toggle("hidden", r.reliability >= 0.5);

    const list = $("signalList");
    list.innerHTML = "";
    const NAME = {
      uniformity: "sigUniformity", lowVariety: "sigLowVariety",
      noContractions: "sigNoContractions", hedgeDensity: "sigHedgeDensity",
      repeatedOpeners: "sigRepeatedOpeners",
    };
    for (const s of r.signals) {
      const row = document.createElement("div");
      row.className = "signal";
      row.innerHTML =
        '<span class="name">' + esc(t(lang, NAME[s.id])) + "</span>" +
        '<span class="bar"><i style="width:0%"></i></span>' +
        '<span class="val">' + pct(s.value) + "</span>";
      list.appendChild(row);
      requestAnimationFrame(() => { row.querySelector("i").style.width = pct(s.value); });
    }

    const strip = $("rhythmStrip");
    strip.innerHTML = "";
    const lens = r.stats.sentenceLengths.slice(0, 40);
    const max = Math.max(1, ...lens);
    for (const n of lens) {
      const bar = document.createElement("i");
      bar.style.height = Math.max(5, (n / max) * 100) + "%";
      strip.appendChild(bar);
    }

    $("detResult").classList.remove("hidden");
  }

  $("analyzeBtn").addEventListener("click", () => {
    clearError("detError");
    const text = $("detText").value;
    if (!text.trim()) return showError("detError", t(lang, "emptyInput"));
    runDetector(text);
  });

  // ---------- humanize ----------
  let strength = "medium";
  $("strengthGroup").querySelectorAll("button").forEach((btn) => {
    btn.addEventListener("click", () => {
      strength = btn.dataset.strength;
      $("strengthGroup").querySelectorAll("button").forEach((b) =>
        b.setAttribute("aria-pressed", String(b === btn)));
    });
  });

  $("humanizeBtn").addEventListener("click", async () => {
    clearError("humError");
    const text = $("humText").value.trim();
    if (!text) return showError("humError", t(lang, "emptyInput"));

    const btn = $("humanizeBtn");
    btn.disabled = true;
    btn.textContent = t(lang, "humWorking");
    try {
      const res = await fetch("/api/humanize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, strength }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "");
      $("humBeforeDoc").textContent = text;
      $("humAfterDoc").textContent = data.rewritten;
      $("humResult").classList.remove("hidden");
    } catch (e) {
      showError("humError", e.message || t(lang, "errorGeneric"));
    } finally {
      btn.disabled = false;
      btn.textContent = t(lang, "humanizeBtn");
    }
  });

  // the adversarial loop: send the rewrite back through the detector
  $("loopBtn").addEventListener("click", () => {
    const rewritten = $("humAfterDoc").textContent;
    if (!rewritten) return;
    $("detText").value = rewritten;
    $("detText").dispatchEvent(new Event("input"));
    $("tab-det").click();
    runDetector(rewritten);
  });

  applyStrings();
})();
