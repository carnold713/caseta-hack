# Optional: run the agent as a container on a NAS or mini PC.
#   docker build -t caseta-agent agent/
#   docker run -d --name caseta-agent --network host --restart unless-stopped \
#     -v $PWD/agent/data:/app/data --env-file agent/.env caseta-agent
FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY agent.py engine.py pair.py .
ENV DATA_DIR=/app/data
CMD ["python", "agent.py"]
