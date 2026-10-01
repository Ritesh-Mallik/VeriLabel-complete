# VeriLabel

**VeriLabel** is a full-stack medicine-label verification workspace. It turns medicine-label images and PDFs into searchable, structured records, flags missing or risky details, and compares incoming labels with approved reference controls.

Built for pharmacy, hospital, and compliance workflows where traceability matters.

## What It Does

- Extracts text from label images and PDFs with local RapidOCR processing.
- Uses OpenRouter-powered validation to structure key label details, including drug name, strength, batch number, dates, manufacturer, storage conditions, and licensing information.
- Calculates confidence, missing fields, and a deterministic risk level for each validation result.
- Stores uploaded documents, OCR output, validation results, and API response snapshots for auditability.
- Lets users create verified reference controls and compare incoming labels against them.
- Highlights textual and structured differences, then returns a pass/fail decision, severity, match percentage, and authenticity score.
- Exports OCR and validation records through the backend API.

## Architecture

```text
Browser
  |
  +-- React frontend (Create React App)
          |
          +-- Flask REST API
                  |
                  +-- RapidOCR / ONNX Runtime for local OCR
                  +-- OpenRouter for structured label validation
                  +-- SQLite by default, PostgreSQL in production
```

## Tech Stack

| Layer | Technology |
| --- | --- |
| Frontend | React 19, React Router, Tailwind CSS |
| Backend | Flask, Flask-SQLAlchemy, Flask-CORS |
| OCR | RapidOCR with ONNX Runtime |
| Validation | OpenRouter API |
| Data | SQLite locally, PostgreSQL supported |
| Deployment | Docker/Render backend and Vercel-ready frontend |

## Repository Layout

```text
VERILABEL-main/
+-- BACKEND/
|   +-- src/                 # Flask application, routes, services, and models
|   +-- assets/samples/      # Sample labels and PDFs
|   +-- scripts/             # Windows and macOS/Linux startup scripts
|   +-- .env.example         # Backend configuration template
|   `-- Dockerfile           # Production backend image
`-- Frontend/verilabel-app/
    +-- src/                 # React pages, components, and API client
    +-- .env.example         # Frontend API URL template
    `-- vercel.json          # SPA deployment rewrite
```

## Prerequisites

- Python 3.10 or newer
- Node.js 18 or newer with npm
- An [OpenRouter API key](https://openrouter.ai/) for label validation
- Poppler is optional for image-only use, but required for PDF OCR on Windows

## Run Locally

### 1. Start the backend

Open a terminal in `BACKEND` and create the environment file.

```powershell
cd BACKEND
Copy-Item .env.example .env
```

Set `OPENROUTER_API_KEY` in `BACKEND/.env`, then start the API.

```powershell
scripts\start_server.bat
```

The script creates a virtual environment and installs Python dependencies when needed. The backend starts at `http://127.0.0.1:5000`.

For macOS or Linux:

```bash
cd BACKEND
cp .env.example .env
# Add OPENROUTER_API_KEY to .env
bash scripts/start_server.sh
```

### 2. Start the frontend

Open a second terminal.

```powershell
cd Frontend\verilabel-app
Copy-Item .env.example .env
npm ci
npm start
```

Open `http://localhost:3000`. The default frontend configuration points to `http://127.0.0.1:5000`.

> The optional `start-frontend.bat` helper starts the frontend on port `3002`. When using it, allow that origin through the backend `CORS_ORIGINS` setting if you have restricted CORS.

## Configuration

### Backend: `BACKEND/.env`

| Variable | Required | Purpose |
| --- | --- | --- |
| `OPENROUTER_API_KEY` | Yes | Enables structured label validation. |
| `PORT` | No | API port. Defaults to `5000`. |
| `DATABASE_URL` | No | SQLite by default; accepts PostgreSQL URLs for deployment. |
| `CORS_ORIGINS` | No | Allowed frontend origin or comma-separated origins. |
| `MAX_UPLOAD_MB` | No | Upload size limit. Defaults to `16`. |
| `UPLOAD_FOLDER` | No | Directory for persisted uploaded labels. |
| `POPPLER_PATH` | No | Windows Poppler binary directory for PDF conversion. |

### Frontend: `Frontend/verilabel-app/.env`

```env
REACT_APP_API_BASE_URL=http://127.0.0.1:5000
```

Point this value to the public backend URL when deploying the frontend.

## Typical Workflow

1. Upload a medicine-label image or PDF.
2. Review the OCR text and run structured validation.
3. Correct or confirm extracted fields, then save a verified control when appropriate.
4. Upload a new label for comparison with the trusted control.
5. Review flagged differences, match percentage, risk context, and final decision.
6. Export records for follow-up or audit use.

Supported uploads: PDF, PNG, JPG/JPEG, BMP, TIFF/TIF, and WebP. The backend limits uploads to 16 MB by default.

## API Highlights

| Endpoint | Method | Purpose |
| --- | --- | --- |
| `/health` | `GET` | Health status and active OCR engine. |
| `/api/ocr/image` | `POST` | Extract text from a supported image upload. |
| `/api/ocr/pdf` | `POST` | Extract text from a PDF upload. |
| `/api/validation/validate-text` | `POST` | Validate OCR text and persist the structured result. |
| `/api/validation/latest` | `GET` | Retrieve recent validation records. |
| `/api/verified/create/<ocr_result_id>` | `POST` | Create a verified reference control. |
| `/api/comparison/run/<control_id>` | `POST` | Compare an incoming label with a reference control. |
| `/api/export/all` | `GET` | Export all available records. |

## Deployment

The backend includes a `Dockerfile` and `render.yaml` for Render deployment. Configure `OPENROUTER_API_KEY`, `DATABASE_URL`, and `CORS_ORIGINS` in the host environment.

The frontend includes `vercel.json` to support React Router's single-page application routes. Set `REACT_APP_API_BASE_URL` to the deployed backend address before building.

```bash
cd Frontend/verilabel-app
npm run build
```

## Data and Security Notes

- Do not commit `.env` files or API keys. Templates are provided in each application directory.
- Uploaded labels and SQLite databases are runtime data and are ignored by Git. API-response exports are also generated at runtime; keep them out of version control if they may contain sensitive label data.
- Configure `CORS_ORIGINS` to your specific frontend domain outside local development.
- VeriLabel is a decision-support tool. Validate results through the appropriate clinical and regulatory review process before operational use.

## License

No license file is currently included. Add a license before distributing or accepting external contributions.
