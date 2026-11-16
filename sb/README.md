# StudyBuddy: RAG over course documents

Upload .md / .docx / .pdf, ask questions, get answers with expandable citations.
Settings: top-k, similarity threshold, semantic or hybrid search. A debug panel shows similarity scores.

## Pipeline
upload -> parse (pypdf for selectable PDF text; python-docx for DOCX; UTF-8 for Markdown) ->
chunk (LangChain RecursiveCharacterTextSplitter: 700 chars, 100 overlap) ->
embed (Pinecone inference, e5-large) -> Pinecone index -> query embedding -> semantic (+ BM25 for hybrid) ->
top-k + threshold -> LangChain prompt/model chain (Groq, optional Anthropic) -> answer with [n] citations

The deployment branch uses lightweight parsers and does not run OCR, so scanned/image-only PDFs need the local `tesseract-local` branch.

## Frontend
The frontend is split by responsibility:

- `frontend/index.html` and `frontend/css/styles.css` contain the page and styles.
- `frontend/js/main.js` initializes the app; `config.js`, `state.js`, and `utils.js` provide shared values and helpers.
- `documents.js`, `search.js`, `chat.js`, and `settings.js` handle the library, search, chat, and controls.
- `navigation.js`, `learn.js`, and `effects.js` handle page navigation, the learning view, and animations.

FastAPI serves the HTML and static assets from the `frontend` directory.

## Run
1. `pip install -r requirements.txt`
2. Copy `.env.example` to `.env` and paste your `PINECONE_API_KEY` and `GROQ_API_KEY` (or ANTHROPIC_API_KEY with LLM_PROVIDER=anthropic)
3. This deployment branch extracts selectable PDF text and does not run OCR. For scanned PDFs, switch to the local `tesseract-local` branch and install the Tesseract OCR engine separately.
4. `uvicorn main:app --host 0.0.0.0 --port 8000`
5. Open http://localhost:8000
