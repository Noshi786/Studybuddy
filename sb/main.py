import os, io, re, json, uuid
from dotenv import load_dotenv
load_dotenv()                                             # reads keys from the .env file
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from pinecone import Pinecone, ServerlessSpec
from rank_bm25 import BM25Okapi
from langchain_core.output_parsers import StrOutputParser
from langchain_core.prompts import ChatPromptTemplate
from langchain_text_splitters import RecursiveCharacterTextSplitter
from pypdf import PdfReader
from unstructured.partition.docx import partition_docx
from unstructured.partition.md import partition_md
from unstructured.partition.text import partition_text

# ---------- setup ----------
INDEX_NAME, NS, DIM = "studybuddy", "docs", 1024          # 1024 = multilingual-e5-large
pc = Pinecone(api_key=os.environ["PINECONE_API_KEY"])
if INDEX_NAME not in pc.list_indexes().names():
    pc.create_index(name=INDEX_NAME, dimension=DIM, metric="cosine",
                    spec=ServerlessSpec(cloud="aws", region="us-east-1"))
index = pc.Index(INDEX_NAME)
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

# small registry of documents + chunks (needed for the list, delete and BM25)
DATA_FILE = "data.json"
DB = json.load(open(DATA_FILE)) if os.path.exists(DATA_FILE) else {}
def save(): json.dump(DB, open(DATA_FILE, "w"))

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
        elements = partition_docx(file=io.BytesIO(data))
    elif ext == "md":
        elements = partition_md(text=data.decode("utf-8", "ignore"))
    elif ext == "txt":
        elements = partition_text(text=data.decode("utf-8", "ignore"))
    else:
        raise HTTPException(status_code=415, detail="Supported formats are PDF, DOCX, Markdown, and TXT.")

    pages = {}
    for element in elements:
        text = element.text.strip()
        if not text:
            continue
        page_number = getattr(element.metadata, "page_number", None)
        page = int(page_number) if page_number else 1
        pages.setdefault(page, []).append(text)

    if not pages:
        raise HTTPException(status_code=422, detail="No readable text found in this document.")

    return [(page, "\n".join(texts)) for page, texts in sorted(pages.items())]

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
async def upload(file: UploadFile = File(...)):
    data = await file.read()
    doc_id, chunks = uuid.uuid4().hex[:8], []
    for page, text in parse(file.filename, data):
        for c in chunk(text):
            if len(c) > 30:
                chunks.append({"id": f"{doc_id}-{len(chunks) + 1}", "page": page, "text": c})
    vecs = embed([c["text"] for c in chunks], "passage")
    items = [(c["id"], v, {"doc": file.filename, "page": c["page"], "text": c["text"]}) for c, v in zip(chunks, vecs)]
    for i in range(0, len(items), 100):
        index.upsert(vectors=items[i:i + 100], namespace=NS)
    DB[doc_id] = {"id": doc_id, "name": file.filename, "type": file.filename.rsplit(".", 1)[-1].lower(), "chunks": chunks}
    save()
    return {"id": doc_id, "chunks": len(chunks)}

@app.get("/api/documents")
def documents():
    return [{"id": d["id"], "name": d["name"], "type": d["type"], "chunk_count": len(d["chunks"])} for d in DB.values()]

@app.delete("/api/documents/{doc_id}")
def delete(doc_id: str):
    d = DB.pop(doc_id, None)
    if d:
        ids = [c["id"] for c in d["chunks"]]
        for i in range(0, len(ids), 100):
            index.delete(ids=ids[i:i + 100], namespace=NS)
        save()
    return {"ok": True}

class Q(BaseModel):
    question: str
    top_k: int = 4
    threshold: float = 0.15
    mode: str = "hybrid"                                  # "semantic" | "hybrid"

@app.post("/api/query")
def query(q: Q):
    # 1) semantic search in Pinecone
    qv = embed([q.question], "query")[0]
    res = index.query(vector=qv, top_k=max(q.top_k * 3, 10), include_metadata=True, namespace=NS)
    cand = {m["id"]: {"chunk_id": m["id"], "doc": m["metadata"]["doc"], "page": int(m["metadata"]["page"]),
                      "text": m["metadata"]["text"], "vector_score": round(float(m["score"]), 3), "keyword_score": 0.0}
            for m in res["matches"]}
    # 2) keyword search (BM25) for hybrid mode
    if q.mode == "hybrid":
        rows = [(d["name"], c) for d in DB.values() for c in d["chunks"]]
        if rows:
            scores = BM25Okapi([tok(c["text"]) for _, c in rows]).get_scores(tok(q.question))
            top = float(max(scores) or 1)
            for (name, c), s in zip(rows, scores):
                ks = round(float(s) / top, 3)
                if c["id"] in cand:
                    cand[c["id"]]["keyword_score"] = ks
                elif ks > 0.3:
                    cand[c["id"]] = {"chunk_id": c["id"], "doc": name, "page": c["page"], "text": c["text"],
                                     "vector_score": 0.0, "keyword_score": ks}
    # 3) final score, top-k, threshold
    for c in cand.values():
        c["score"] = round(0.6 * c["vector_score"] + 0.4 * c["keyword_score"], 3) if q.mode == "hybrid" else float(c["vector_score"])
    top = sorted(cand.values(), key=lambda c: -c["score"])[:q.top_k]
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

app.mount("/", StaticFiles(directory="frontend", html=True), name="ui")   # keep this last
