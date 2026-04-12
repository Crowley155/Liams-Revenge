FROM python:3.12-slim

WORKDIR /app

RUN pip install --no-cache-dir uv

COPY pyproject.toml .
RUN uv pip install --system --no-build-isolation \
    fastapi uvicorn[standard] dspy httpx beautifulsoup4 \
    python-dotenv qdrant-client "langfuse>=2.0,<3.0" \
    openinference-instrumentation-dspy pytest pytest-asyncio

COPY . .

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]
