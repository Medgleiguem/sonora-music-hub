FROM node:22-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates ffmpeg python3 python3-pip \
  && pip3 install --break-system-packages --no-cache-dir yt-dlp \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY server ./server

ENV NODE_ENV=production
ENV YT_DLP_PATH=yt-dlp
ENV PORT=10000

EXPOSE 10000

CMD ["node", "server/index.mjs"]
