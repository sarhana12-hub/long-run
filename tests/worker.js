// The Cloudflare Worker is pasted into the dashboard by hand, so a syntax slip would only
// show up after a deploy. This parses it the way the editor would. Exit 1 on failure.
const fs = require('fs'); const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'strava-worker', 'worker.js'), 'utf8').replace(/export default {/, 'module.exports = {');
try { new Function(src); console.log('worker parses'); } catch (e) { console.log('WORKER DOES NOT PARSE: ' + e.message); process.exit(1); }
