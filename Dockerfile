FROM python:3.11-slim

# Dependencias nativas para OpenCV-headless y libpq (PostgreSQL)
RUN apt-get update && apt-get install -y --no-install-recommends \
    libglib2.0-0 \
    libpq5 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Asegura carpeta de respaldo local para evidencias
RUN mkdir -p frontend/static/uploads

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]