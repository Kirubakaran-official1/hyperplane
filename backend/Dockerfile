# One image for both the API and the collector (the collector needs Chromium).
# Works on ARM (Oracle Ampere) and x86.
FROM python:3.12-slim-bookworm

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    TZ=Asia/Kolkata

RUN apt-get update \
 && apt-get install -y --no-install-recommends chromium chromium-driver fonts-liberation tzdata curl \
 && ln -sf /usr/bin/chromium /usr/bin/chromium-browser \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app
COPY scanner ./scanner

EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers", "--forwarded-allow-ips", "*"]
