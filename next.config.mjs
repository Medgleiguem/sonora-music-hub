/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ['ffmpeg-static'],
  outputFileTracingIncludes: {
    '/api/youtube/*': ['./bin/yt-dlp*', './node_modules/ffmpeg-static/ffmpeg*']
  }
};

export default nextConfig;
