// Print the generated GLSL for one simulation, with line numbers.
const path = require('path');
const ROOT = path.join(__dirname, '..');
const fs = require('fs');

const which = process.argv[2] || 'fluid';
const part = process.argv[3] || 'step';

// Pull the source out of the module the same way the pipeline does.
const src = fs.readFileSync(path.join(ROOT, 'renderer', 'js', 'lyrics', 'gl', 'sim.js'), 'utf8');
// sim.js is a UMD: in node it just requires its two siblings
const sim = require(path.join(ROOT, 'renderer', 'js', 'lyrics', 'gl', 'sim.js'));

const def = sim.SIM_DEFS[which];
const body = def[part];
const head = part === 'reset'
  ? src.match(/const RESET_HEAD = `([\s\S]*?)`;/)[1]
  : src.match(/const STEP_HEAD = `([\s\S]*?)`;/)[1];
const full = `${head}${body}`;
const lines = full.split('\n');
lines.forEach((line, i) => console.log(String(i + 1).padStart(3), line));
console.log('---');
console.log('total lines', lines.length);
console.log('variants present:', ['bilerp', 'pressAt', 'u_pass'].map((k) => `${k}=${body.includes(k)}`).join(' '));
