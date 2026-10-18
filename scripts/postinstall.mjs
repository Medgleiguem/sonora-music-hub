import { copyFile } from 'node:fs/promises';

// jsmediatags' browser entry is distributed only under its minified filename.
await copyFile('node_modules/jsmediatags/dist/jsmediatags.min.js', 'node_modules/jsmediatags/dist/jsmediatags.js');
