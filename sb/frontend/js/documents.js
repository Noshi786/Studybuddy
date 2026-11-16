import { API_BASE, OWL } from "./config.js";
import { S, nextUid } from "./state.js";
import { $, chunk, esc } from "./utils.js";

const addDoc = (name, text, type) => {
  const d = { id: nextUid(), name, type, chunks: [] };
  chunk(text).forEach((c, i) =>
    d.chunks.push({ id: d.id + "-" + (i + 1), text: c, page: i + 1 }),
  );
  S.docs.push(d);
  renderDocs();
};
const COL = { pdf: "#ff6b6b", docx: "#4cc9f0", md: "#7b61ff", txt: "#2ec4a6" };
const cnt = (d) => d.chunk_count ?? (d.chunks ? d.chunks.length : 0);
export function renderDocs() {
  const n = S.docs.length,
    ch = S.docs.reduce((a, d) => a + cnt(d), 0);
  document.querySelectorAll("[data-docs]").forEach((e) => (e.textContent = n));
  document
    .querySelectorAll("[data-chunks]")
    .forEach((e) => (e.textContent = ch));
  $("shelf").innerHTML =
    S.docs
      .map((d, i) => {
        const status = d.uploading
          ? "Uploading and indexing..."
          : cnt(d)
            ? cnt(d) + " passages indexed"
            : "needs the backend to read this file";
        const removeButton = d.uploading
          ? ""
          : `<button data-id="${d.id}" aria-label="Remove">✕</button>`;
        return `<div class="book" style="--c:${COL[d.type] || "#999"};animation-delay:${i * 0.07}s"><span class="tag">${d.type}</span><h4>${esc(d.name)}</h4><small>${status}</small>${removeButton}</div>`;
      })
      .join("") ||
    `<div class="empty">${OWL}<p>Your shelf is empty. Add a file to get started!</p></div>`;
}
function toast(t) {
  const e = $("toast");
  e.textContent = t;
  e.classList.add("on");
  setTimeout(() => e.classList.remove("on"), 2200);
}

async function handle(files) {
  const selectedFiles = Array.from(files);
  if (!API_BASE) {
    for (const file of selectedFiles) {
      const ext = file.name.split(".").pop().toLowerCase();
      if (ext == "md" || ext == "txt")
        addDoc(file.name, await file.text(), ext);
      else {
        S.docs.push({
          id: nextUid(),
          name: file.name,
          type: ext,
          chunks: [],
        });
        renderDocs();
      }
    }
    toast("Added to your library ✔");
    return;
  }

  const uploads = selectedFiles.map((file) => ({
    file,
    id: `pending-${nextUid()}`,
  }));
  S.docs.push(
    ...uploads.map(({ file, id }) => ({
      id,
      name: file.name,
      type: file.name.split(".").pop().toLowerCase(),
      chunks: [],
      uploading: true,
    })),
  );
  renderDocs();

  const failedUploads = [];
  for (const { file, id } of uploads) {
    const ext = file.name.split(".").pop().toLowerCase();
    try {
      const formData = new FormData();
      formData.append("file", file);
      const response = await fetch(API_BASE + "/api/documents", {
        method: "POST",
        body: formData,
      });
      if (!response.ok) {
        let message = `Upload failed with HTTP ${response.status}`;
        try {
          const error = await response.json();
          if (typeof error.detail === "string") message = error.detail;
        } catch (error) {
          console.error("Could not read the upload error response.", error);
        }
        throw new Error(message);
      }
      const result = await response.json();
      if (typeof result.id !== "string" || typeof result.chunks !== "number") {
        throw new Error("The server returned an invalid upload response.");
      }
      S.docs = S.docs.map((doc) =>
        doc.id === id
          ? {
              id: result.id,
              name: file.name,
              type: ext,
              chunk_count: result.chunks,
            }
          : doc,
      );
      renderDocs();
    } catch (error) {
      S.docs = S.docs.filter((doc) => doc.id !== id);
      renderDocs();
      console.error(`Could not upload ${file.name}.`, error);
      failedUploads.push(`${file.name}: ${error.message}`);
    }
  }

  if (failedUploads.length) {
    toast(failedUploads.join("; "));
  } else {
    toast("Added to your library ✔");
  }
}

export function initDocuments() {
  $("shelf").onclick = async (e) => {
    const id = e.target.dataset.id;
    if (!id) return;
    if (API_BASE)
      await fetch(API_BASE + "/api/documents/" + id, { method: "DELETE" });
    S.docs = S.docs.filter((d) => d.id != id);
    renderDocs();
    toast("Removed from library");
  };
  $("drop").onclick = () => $("file").click();
  $("file").onchange = (e) => {
    const files = Array.from(e.target.files);
    e.target.value = "";
    handle(files);
  };
  ["dragover", "dragleave", "drop"].forEach((ev) =>
    $("drop").addEventListener(ev, (e) => {
      e.preventDefault();
      $("drop").classList.toggle("on", ev == "dragover");
      if (ev == "drop") handle(e.dataTransfer.files);
    }),
  );
}

export function loadDocuments() {
  fetch(API_BASE + "/api/documents")
    .then((r) => r.json())
    .then((r) => {
      S.docs = r;
      renderDocs();
    })
    .catch(() => {});
  if (API_BASE) $("mode").textContent = "Connected";
  renderDocs();
}
