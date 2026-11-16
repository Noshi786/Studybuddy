import { API_BASE } from "./config.js";
import { S } from "./state.js";
import { tok } from "./utils.js";

function localSearch(q) {
  const qt = tok(q),
    qs = new Set(qt),
    all = [];
  S.docs.forEach((d) =>
    d.chunks.forEach((c) => {
      const ct = tok(c.text),
        cs = new Set(ct);
      const kw = qs.size
        ? [...qs].filter((w) => cs.has(w)).length / qs.size
        : 0;
      const tf = (w) => ct.filter((x) => x == w).length;
      let dot = 0,
        a = 0,
        b = 0;
      new Set([...qt, ...ct]).forEach((w) => {
        const x = qt.filter((y) => y == w).length,
          y = tf(w);
        dot += x * y;
        a += x * x;
        b += y * y;
      });
      const vec = a && b ? dot / Math.sqrt(a * b) : 0;
      all.push({
        chunk_id: c.id,
        doc: d.name,
        page: c.page,
        text: c.text,
        vector_score: +vec.toFixed(3),
        keyword_score: +kw.toFixed(3),
        score: +(S.mode == "hybrid" ? 0.6 * vec + 0.4 * kw : vec).toFixed(3),
      });
    }),
  );
  all.sort((x, y) => y.score - x.score);
  const top = all.slice(0, S.k);
  top.forEach((r) => (r.kept = r.score >= S.th));
  const kept = top.filter((r) => r.kept);
  const sent = (r) => {
    const ss = r.text.replace(/^#.*\n+/, "").split(/(?<=[.!?])\s+/);
    return ss
      .map((s) => [s, tok(s).filter((w) => qs.has(w)).length])
      .sort((x, y) => y[1] - x[1])[0][0];
  };
  const answer = kept.length
    ? "Based on your documents: " +
      kept
        .slice(0, 2)
        .map((r, i) => sent(r) + ' <sup class="c">' + (i + 1) + "</sup>")
        .join(" ")
    : "I couldn’t find this in the uploaded documents. Try lowering the similarity threshold or rephrasing.";
  return {
    answer,
    citations: kept.map((r, i) => ({ n: i + 1, ...r })),
    debug: top,
  };
}
export async function query(q) {
  if (API_BASE) {
    const r = await fetch(API_BASE + "/api/query", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        question: q,
        top_k: S.k,
        threshold: S.th,
        mode: S.mode,
      }),
    });
    return r.json();
  }
  await new Promise((r) => setTimeout(r, 700));
  return localSearch(q);
}
