import { API_BASE, OWL } from "./config.js";
import { S } from "./state.js";
import { query } from "./search.js";
import { $, esc, tok } from "./utils.js";

const hl = (t, q) => {
  const w = new Set(tok(q));
  return esc(t).replace(/[A-Za-z0-9]+/g, (x) =>
    w.has(x.toLowerCase().replace(/(ing|es|s)$/, ""))
      ? "<mark>" + x + "</mark>"
      : x,
  );
};
const down = () => {
  $("msgs").scrollTop = 1e9;
};
const user = (t) => {
  const m = document.createElement("div");
  m.className = "m u";
  m.innerHTML = '<div class="bub">' + esc(t) + "</div>";
  $("msgs").appendChild(m);
  down();
};
const bot = (h) => {
  const m = document.createElement("div");
  m.className = "m b";
  m.innerHTML =
    '<div class="av">' + OWL + '</div><div class="bub">' + h + "</div>";
  $("msgs").appendChild(m);
  down();
  return m.querySelector(".bub");
};
async function ask(q) {
  q = q.trim();
  if (!q) return;
  location.hash = "ask";
  const em = $("empty");
  if (em) em.remove();
  user(q);
  $("q").value = "";
  const b = bot(
    '<span class="dots"><span></span><span></span><span></span></span>',
  );
  let r;
  try {
    r = await query(q);
  } catch (e) {
    b.textContent =
      "Hmm, I couldn’t reach the server. Please check that the backend is running.";
    return;
  }
  const ans = API_BASE
    ? esc(r.answer).replace(/\[(\d+)\]/g, '<sup class="c">$1</sup>')
    : r.answer;
  const top = Math.max(0, ...r.debug.map((d) => d.score)),
    n = r.citations.length;
  const lv =
    top >= 0.6
      ? ["High", "hi"]
      : top >= 0.35
        ? ["Medium", "md"]
        : ["Low", "lo"];
  b.innerHTML =
    `<div class="steps"><span>🔎 Searched ${r.debug.length} passages</span><i>→</i><span>✅ ${n} passed the threshold</span><i>→</i><span>✍️ Wrote the answer</span></div><div class="ans">${ans}</div>` +
    (n
      ? `<div class="conf ${lv[1]}"><b>Confidence: ${lv[0]}</b><div class="mt"><i></i></div></div><h5>Evidence</h5>` +
        r.citations
          .map(
            (c) =>
              `<details data-n="${c.n}"><summary><span class="nb">${c.n}</span><div><b>${esc(c.doc)}</b><small>section ${c.page}</small></div><em>${c.score.toFixed(2)}</em></summary><p>${hl(c.text, q)}</p></details>`,
          )
          .join("")
      : '<p class="hint">Try lowering the strictness in Tuning, or ask it a different way.</p>');
  setTimeout(() => {
    const f = b.querySelector(".mt i");
    if (f) f.style.width = Math.min(100, top * 100) + "%";
  }, 60);
  $("dbg").className = "";
  $("dbg").innerHTML =
    `<table><tr><th>Chunk</th><th>Vector</th><th>Keyword</th><th>Score</th><th></th></tr>${r.debug.map((d) => `<tr><td title="${esc(d.doc)}">${d.chunk_id}</td><td>${d.vector_score.toFixed(2)}</td><td>${d.keyword_score.toFixed(2)}</td><td><div class="bar"><i data-w="${Math.min(100, d.score * 100)}"></i></div>${d.score.toFixed(2)}</td><td class="${d.kept ? "ok" : "no"}">${d.kept ? "✓" : "✕"}</td></tr>`).join("")}</table><p class="hint" style="margin-top:10px">Mode ${S.mode} · top-k ${S.k} · threshold ${S.th.toFixed(2)}. ✓ means the passage was used for the answer.</p>`;
  setTimeout(
    () =>
      document
        .querySelectorAll("#dbg .bar i")
        .forEach((i) => (i.style.width = i.dataset.w + "%")),
    60,
  );
  down();
}

export function initChat() {
  $("msgs").onclick = (e) => {
    if (e.target.classList.contains("c")) {
      const d = e.target
        .closest(".bub")
        .querySelector('details[data-n="' + e.target.textContent + '"]');
      if (d) {
        d.open = true;
        d.scrollIntoView({ behavior: "smooth", block: "nearest" });
      }
    }
  };
  $("f").onsubmit = (e) => {
    e.preventDefault();
    ask($("q").value);
  };
  $("sug").innerHTML = [
    "What is the pass mark?",
    "How much attendance do I need?",
    "What if I submit late?",
  ]
    .map((s) => `<button>${s}</button>`)
    .join("");
  $("sug").onclick = (e) => {
    if (e.target.tagName == "BUTTON") ask(e.target.textContent);
  };
}
