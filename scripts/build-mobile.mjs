import { build } from 'esbuild';
import { mkdir, rm, cp, writeFile } from 'node:fs/promises';
import nextEnv from '@next/env';
import { resolve } from 'node:path';
nextEnv.loadEnvConfig(process.cwd());
const outdir = 'mobile-dist';
await rm(outdir, { recursive: true, force: true });
await mkdir(outdir, { recursive: true });
// Public website APK/source downloads are release artifacts, never app assets.
// Copying them here recursively embeds the previous APK into the next one.
const publicDownloads = resolve('public/downloads');
await cp('public', outdir, { recursive: true, filter: source => resolve(source) !== publicDownloads });
const define = { 'process.env.NODE_ENV': '"production"' };
for (const name of ['NEXT_PUBLIC_YOUTUBE_ENABLED', 'NEXT_PUBLIC_YOUTUBE_REGION', 'NEXT_PUBLIC_JAMENDO_CLIENT_ID']) define[`process.env.${name}`] = JSON.stringify(process.env[name] || '');
await build({ entryPoints: ['mobile/main.jsx'], outdir, bundle: true, minify: true, format: 'esm', target: ['chrome110'], jsx: 'automatic', define });
await writeFile(`${outdir}/index.html`, '<!doctype html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"><meta name="theme-color" content="#0b0b0c"><title>Sonora</title><link rel="stylesheet" href="/main.css"></head><body><div id="root"></div><script type="module" src="/main.js"></script></body></html>');
