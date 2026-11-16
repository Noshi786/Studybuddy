import { $ } from "./utils.js";

export function initLearn() {
  // learn page
  const ST = [
    [
      "Upload",
      "📄",
      "You add a PDF, Word or Markdown file to your library.",
      "POST /api/documents",
    ],
    [
      "Parse",
      "🔎",
      "The app pulls the plain text out of the file, page by page, so the computer can read it.",
      "pypdf · python-docx",
    ],
    [
      "Chunk",
      "✂️",
      "Long text is cut into small overlapping pieces (about 700 characters) so we can find the exact part that answers a question.",
      "700 chars · 100 overlap",
    ],
    [
      "Embed",
      "🧠",
      "Each chunk becomes a list of numbers that captures its meaning. Similar meanings get similar numbers.",
      "embedding model",
    ],
    [
      "Store",
      "🗄️",
      "The numbers (vectors) are saved in a vector database, together with the chunk’s source details.",
      "Pinecone",
    ],
    [
      "Search",
      "🧲",
      "Your question is turned into numbers too, then the closest chunks are found. Hybrid mode adds keyword matching (BM25).",
      "top-k · threshold",
    ],
    [
      "Answer",
      "✍️",
      "The best chunks go to the AI, which writes the answer and cites them. Open a citation to read the real passage.",
      "LLM + citations",
    ],
  ];
  $("steps").innerHTML = ST.map(
    (s, i) =>
      `<button class="stp" data-i="${i}"><span>${s[1]}</span>${s[0]}</button>`,
  ).join("");
  let cur = 0,
    auto = true;
  const show = (i) => {
    cur = i;
    document
      .querySelectorAll(".stp")
      .forEach((b, j) => b.classList.toggle("on", j == i));
    $("sd").innerHTML =
      `<h3>${i + 1}. ${ST[i][0]}</h3><p>${ST[i][2]}</p><code>${ST[i][3]}</code>`;
    $("fill").style.width = (i / (ST.length - 1)) * 100 + "%";
  };
  $("steps").onclick = (e) => {
    const b = e.target.closest(".stp");
    if (b) {
      auto = false;
      show(+b.dataset.i);
    }
  };
  show(0);
  setInterval(() => {
    if (auto && location.hash == "#learn") show((cur + 1) % ST.length);
  }, 3200);
  const GL = [
    ["Chunk", "A small piece of a document, like one paragraph.", "#ffc83d"],
    [
      "Embedding",
      "A list of numbers that stores the meaning of a piece of text.",
      "#4cc9f0",
    ],
    [
      "Similarity score",
      "How close two meanings are. Near 1 is very similar, near 0 is unrelated.",
      "#2ec4a6",
    ],
    [
      "Threshold",
      "The minimum score a chunk needs before it is used. Higher is stricter.",
      "#ff6b6b",
    ],
    [
      "Top-k",
      "How many of the best-matching chunks are handed to the AI.",
      "#b9a8ff",
    ],
    [
      "Hybrid search",
      "Meaning search plus keyword search, so you get ideas and exact words.",
      "#ffb57a",
    ],
  ];
  $("gl").innerHTML = GL.map(
    (g) =>
      `<div class="fc" style="--c:${g[2]}" tabindex="0"><div class="in2"><div class="f">${g[0]}</div><div class="k">${g[1]}</div></div></div>`,
  ).join("");
  $("gl").onclick = (e) => {
    const c = e.target.closest(".fc");
    if (c) c.classList.toggle("fl");
  };
}
