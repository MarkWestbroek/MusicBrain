# piper-tts — de spraakdienst voor het Zang-venster, als container.
#
#   docker build -t musicbrain-tts tools/piper-tts
#   docker run -d --name musicbrain-tts --restart unless-stopped \
#     -p 127.0.0.1:8788:8788 \
#     -v /srv/musicbrain-ai:/invites:ro -v /srv/musicbrain-tts:/data \
#     musicbrain-tts
#
# De stemmen zitten in het image (vier keer ~63 MB). Toegang gaat met de
# codes van de AI-proxy (invites.json, alleen-lezen gekoppeld).
FROM python:3.12-slim

RUN pip install --no-cache-dir "piper-tts[alignment]==1.8.0"

ARG VOICES="nl_NL-pim-medium nl_NL-ronnie-medium nl_NL-alex-medium nl_BE-nathalie-medium"
RUN mkdir -p /voices && python -m piper.download_voices --data-dir /voices ${VOICES}

COPY server.py /app/server.py

ENV TTS_HOST=0.0.0.0 \
    TTS_PORT=8788 \
    TTS_VOICES=/voices \
    TTS_INVITES=/invites/invites.json \
    TTS_USAGE=/data/usage.jsonl \
    TTS_PER_DAY=200 \
    PYTHONUNBUFFERED=1 \
    PYTHONIOENCODING=utf-8

EXPOSE 8788
USER nobody
CMD ["python", "/app/server.py"]
