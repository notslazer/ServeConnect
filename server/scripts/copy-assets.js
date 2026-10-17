// Copies non-TS assets (SQL migrations) into dist after `tsc`.
const fs = require('fs');
const path = require('path');
const src = path.join(__dirname, '..', 'src', 'db', 'migrations');
const dest = path.join(__dirname, '..', 'dist', 'db', 'migrations');
fs.mkdirSync(dest, { recursive: true });
for (const f of fs.readdirSync(src)) fs.copyFileSync(path.join(src, f), path.join(dest, f));
console.log('Copied migrations to dist');
