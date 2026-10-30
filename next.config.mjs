/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ['ffmpeg-static'],
  outputFileTracingIncludes: {
    '/api/youtube/*': ['./bin/yt-dlp*', './node_modules/ffmpeg-static/ffmpeg*']
  },
  // The site's front door is the Android download page; the web player lives at /app.
  async rewrites() {
    return {
      beforeFiles: ['/', '/download', '/downloads', '/android'].map((source) => ({ source, destination: '/downloads/index.html' }))
    };
  }
};

export default nextConfig;
