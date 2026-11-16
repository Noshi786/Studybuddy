# StudyBuddy: RAG over course documents

Upload .md / .docx / .pdf, ask questions, get answers with expandable citations.
Settings: top-k, similarity threshold, semantic or hybrid search. A debug panel shows similarity scores.

## Pipeline
upload -> parse (pypdf / python-docx; scanned PDF pages use Tesseract OCR via PyMuPDF and Pillow) ->
chunk (LangChain RecursiveCharacterTextSplitter: 700 chars, 100 overlap) ->
embed (Pinecone inference, e5-large) -> Pinecone index -> query embedding -> semantic (+ BM25 for hybrid) ->
top-k + threshold -> LangChain prompt/model chain (Groq, optional Anthropic) -> answer with [n] citations

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
3. Install the Tesseract OCR engine separately and ensure `tesseract.exe` is on PATH. Set `TESSERACT_CMD` in `.env` if it is installed elsewhere; `TESSERACT_LANG` defaults to `eng`.
4. `uvicorn main:app --host 0.0.0.0 --port 8000`
5. Open http://localhost:8000
