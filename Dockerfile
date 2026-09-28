FROM python:3.11-slim

ENV DEBIAN_FRONTEND=noninteractive

# Node (docx generation) + headless LibreOffice (docx -> pdf) + Carlito
# (metric-compatible Calibri substitute so the PDF matches the source design).
RUN apt-get update && apt-get install -y --no-install-recommends \
    nodejs \
    npm \
    libreoffice-writer \
    fonts-crosextra-carlito \
    fonts-liberation \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Python deps
COPY server/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# App source
COPY server/ .

# Node deps for the docx generators
RUN cd generator && npm install --omit=dev

# LibreOffice needs a writable HOME for its per-run profile.
ENV HOME=/tmp

EXPOSE 8000

CMD uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}
