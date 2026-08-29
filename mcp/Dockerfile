FROM python:3.12-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY server.py .

ENV API_BASE_URL=http://api:8000/api
ENV API_TOKEN=""

CMD ["python", "server.py"]
