import os, io, re, uuid
from dotenv import load_dotenv
load_dotenv()                                             # reads keys from the .env file
from fastapi import FastAPI, UploadFile, File, HTTPException, Header
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from pinecone import Pinecone, ServerlessSpec
from rank_bm25 import BM25Okapi
from docx import Document
from langchain_core.output_parsers import StrOutputParser
from langchain_core.prompts import ChatPromptTemplate
from langchain_text_splitters import RecursiveCharacterTextSplitter
from pypdf import PdfReader

# ---------- setup ----------
INDEX_NAME, DIM = "studybuddy", 1024                      # 1024 = multilingual-e5-large
pc = Pinecone(api_key=os.environ["PINECONE_API_KEY"])
if INDEX_NAME not in pc.list_indexes().names():
    pc.create_index(name=INDEX_NAME, dimension=DIM, metric="cosine",
                    spec=ServerlessSpec(cloud="aws", region="us-east-1"))
index = pc.Index(INDEX_NAME)
DUMMY = [1.0] + [0.0] * (DIM - 1)                         # placeholder vector for registry records

PROVIDER = os.getenv("LLM_PROVIDER", "groq")             # "groq" (free) or "anthropic"
if PROVIDER == "groq":
    from langchain_groq import ChatGroq
    MODEL = os.getenv("LLM_MODEL", "openai/gpt-oss-20b")
    llm = ChatGroq(groq_api_key=os.environ["GROQ_API_KEY"], model=MODEL, temperature=0.2, max_tokens=600)
else:
    from langchain_anthropic import ChatAnthropic
    MODEL = os.getenv("LLM_MODEL", "claude-sonnet-5-5")
    llm = ChatAnthropic(anthropic_api_key=os.environ["ANTHROPIC_API_KEY"], model=MODEL, max_tokens=600)
SYSTEM = "Answer ONLY from the numbered passages. Cite sources like [1]. If the answer is not in them, say you don't know."

answer_chain = (
    ChatPromptTemplate.from_messages([
        ("system", SYSTEM),
        ("human", "Passages:\n{context}\n\nQuestion: {question}"),
    ])
    | llm
    | StrOutputParser()
)

# NOTE: no local data.json any more (Vercel's filesystem is read-only).
# The document list lives in Pinecone, in a separate "registry" namespace.

# ---------- per-user isolation ----------
def namespaces(client_id):
    """Each browser sends a random X-Client-Id; its documents live in their own Pinecone namespaces."""
    if not re.fullmatch(r"[A-Za-z0-9-]{8,64}", client_id or ""):
        raise HTTPException(status_code=400, detail="Missing or invalid X-Client-Id header.")
    return f"docs-{client_id}", f"reg-{client_id}"

# ---------- helpers ----------
tok = lambda s: re.findall(r"[a-z0-9]+", s.lower())
splitter = RecursiveCharacterTextSplitter(chunk_size=700, chunk_overlap=100)

def parse(name, data):                                    # -> [(page, text)]
    ext = name.rsplit(".", 1)[-1].lower()
    if ext == "pdf":
        pages = [
            (i + 1, text)
            for i, page in enumerate(PdfReader(io.BytesIO(data)).pages)
            if (text := (page.extract_text() or "").strip())
        ]
        if not pages:
            raise HTTPException(
                status_code=422,
                detail="No selectable text found in this PDF. Scanned PDFs require OCR; use the local Tesseract branch.",
            )
        return pages
    if ext == "docx":
        text = "\n".join(p.text for p in Document(io.BytesIO(data)).paragraphs)
    elif ext in {"md", "txt"}:
        text = data.decode("utf-8", "ignore")
    else:
        raise HTTPException(status_code=415, detail="Supported formats are PDF, DOCX, Markdown, and TXT.")

    text = text.strip()
    if not text:
        raise HTTPException(status_code=422, detail="No readable text found in this document.")

    return [(1, text)]

def chunk(text):
    text = re.sub(r"\s+", " ", text).strip()
    yield from splitter.split_text(text)

def embed(texts, kind):                                   # kind: "passage" or "query"
    out = []
    for i in range(0, len(texts), 90):
        r = pc.inference.embed(model="multilingual-e5-large", inputs=texts[i:i + 90],
                               parameters={"input_type": kind, "truncate": "END"})
        out += [list(e.values) for e in r]
    return out

# ---------- API ----------
app = FastAPI()
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

@app.post("/api/documents")
async def upload(file: UploadFile = File(...), x_client_id: str = Header(None)):
    NS, REG_NS = namespaces(x_client_id)
    data = await file.read()
    doc_id, chunks = uuid.uuid4().hex[:8], []
    for page, text in parse(file.filename, data):
        for c in chunk(text):
            if len(c) > 30:
                chunks.append({"id": f"{doc_id}-{len(chunks) + 1}", "page": page, "text": c})
    if not chunks:
        raise HTTPException(status_code=422, detail="No usable text found in this document.")
    vecs = embed([c["text"] for c in chunks], "passage")
    items = [(c["id"], v, {"doc": file.filename, "page": c["page"], "text": c["text"]}) for c, v in zip(chunks, vecs)]
    for i in range(0, len(items), 100):
        index.upsert(vectors=items[i:i + 100], namespace=NS)
    # registry record (replaces data.json)
    index.upsert(vectors=[(doc_id, DUMMY, {"name": file.filename,
                                           "type": file.filename.rsplit(".", 1)[-1].lower(),
                                           "chunk_count": len(chunks)})],
                 namespace=REG_NS)
    return {"id": doc_id, "chunks": len(chunks)}

@app.get("/api/documents")
def documents(x_client_id: str = Header(None)):
    NS, REG_NS = namespaces(x_client_id)
    res = index.query(vector=DUMMY, top_k=1000, include_metadata=True, namespace=REG_NS)
    return [{"id": m["id"], "name": m["metadata"]["name"], "type": m["metadata"]["type"],
             "chunk_count": int(m["metadata"]["chunk_count"])} for m in res["matches"]]

@app.delete("/api/documents/{doc_id}")
def delete(doc_id: str, x_client_id: str = Header(None)):
    NS, REG_NS = namespaces(x_client_id)
    got = index.fetch(ids=[doc_id], namespace=REG_NS)
    rec = got.vectors.get(doc_id) if hasattr(got, "vectors") else None
    if rec:
        n = int(rec.metadata["chunk_count"])
        ids = [f"{doc_id}-{i}" for i in range(1, n + 1)]
        for i in range(0, len(ids), 100):
            index.delete(ids=ids[i:i + 100], namespace=NS)
        index.delete(ids=[doc_id], namespace=REG_NS)
    return {"ok": True}

class Q(BaseModel):
    question: str
    top_k: int = 4
    threshold: float = 0.15
    mode: str = "hybrid"                                  # "semantic" | "hybrid"

@app.post("/api/query")
def query(q: Q, x_client_id: str = Header(None)):
    NS, REG_NS = namespaces(x_client_id)
    # 1) semantic search in Pinecone
    qv = embed([q.question], "query")[0]
    res = index.query(vector=qv, top_k=max(q.top_k * 4, 20), include_metadata=True, namespace=NS)
    cand = [{"chunk_id": m["id"], "doc": m["metadata"]["doc"], "page": int(m["metadata"]["page"]),
             "text": m["metadata"]["text"], "vector_score": round(float(m["score"]), 3), "keyword_score": 0.0}
            for m in res["matches"]]
    # 2) keyword search (BM25) re-scoring of the Pinecone candidates (hybrid mode)
    if q.mode == "hybrid" and cand:
        scores = BM25Okapi([tok(c["text"]) for c in cand]).get_scores(tok(q.question))
        top = float(max(scores))
        if top > 0:
            for c, s in zip(cand, scores):
                c["keyword_score"] = round(max(float(s), 0.0) / top, 3)
    # 3) final score, top-k, threshold
    for c in cand:
        c["score"] = round(0.6 * c["vector_score"] + 0.4 * c["keyword_score"], 3) if q.mode == "hybrid" else float(c["vector_score"])
    top = sorted(cand, key=lambda c: -c["score"])[:q.top_k]
    for c in top:
        c["kept"] = bool(c["score"] >= q.threshold)
    kept = [c for c in top if c["kept"]]
    if not kept:
        return {"answer": "I couldn't find this in the uploaded documents.", "citations": [], "debug": top}
    # 4) generate the answer from the kept passages only
    ctx = "\n\n".join(f"[{i + 1}] ({c['doc']}, p.{c['page']})\n{c['text']}" for i, c in enumerate(kept))
    answer = answer_chain.invoke({"context": ctx, "question": q.question})
    return {"answer": answer,
            "citations": [{"n": i + 1, **c} for i, c in enumerate(kept)], "debug": top}

# keep this last; skip if the folder isn't bundled (avoids a crash at startup on Vercel)
if os.path.isdir("frontend"):
    app.mount("/", StaticFiles(directory="frontend", html=True), name="ui")