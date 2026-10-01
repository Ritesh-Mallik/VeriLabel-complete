FROM python:3.11-slim

# System deps:
#   poppler-utils  - PDF -> image rasterization (pdf2image)
#   libgl1 / libglib2.0-0 - runtime libs opencv-python needs
RUN apt-get update && apt-get install -y --no-install-recommends \
    poppler-utils \
    libgl1 \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .

RUN pip install --no-cache-dir -r requirements.txt

COPY . .

ENV PYTHONUNBUFFERED=1
ENV PORT=5000
EXPOSE 5000

WORKDIR /app/src

# 1 worker + threads (not 2+ workers): RapidOCR loads its model per-process,
# so extra workers would multiply memory on a small (e.g. 512MB) host and risk
# an OOM kill mid-request. Threads share the one loaded model, and both the
# OCR (ONNX Runtime) and the OpenRouter HTTP wait release the GIL, so threads
# still give real concurrency — a slow validation call won't block health
# checks or other OCR requests. Timeout has headroom over the OpenRouter
# service's own 45s-per-attempt (with one retry) so a slow-but-progressing
# response finishes instead of getting the whole worker killed.
CMD ["sh", "-c", "gunicorn --bind 0.0.0.0:${PORT} --workers 1 --threads 4 --timeout 180 app:app"]
