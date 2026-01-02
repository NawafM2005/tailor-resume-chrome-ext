FROM python:3.11-slim

# Install LaTeX and dependencies
RUN apt-get update && apt-get install -y \
    texlive-latex-base \
    texlive-fonts-recommended \
    texlive-latex-extra \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy server files
COPY server/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY server/ .

# Expose port (Render will set PORT env variable)
EXPOSE 8000

# Run the application
CMD uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}
