FROM python:3.12-alpine

RUN pip install --no-cache-dir tinytuya paho-mqtt

WORKDIR /app
COPY bridge.py .

CMD ["python3", "bridge.py"]
