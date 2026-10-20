const original = '林澈';
const bytes = new TextEncoder().encode(original);
const first = bytes.slice(0, 1);
const rest = bytes.slice(1);
const independent = new TextDecoder().decode(first) + new TextDecoder().decode(rest);
const streaming = new TextDecoder('utf-8', { fatal: true });
const complete = streaming.decode(first, { stream: true }) + streaming.decode(rest, { stream: true }) + streaming.decode();
console.log(JSON.stringify({ original, utf8Bytes: [...bytes], firstChunk: [...first], restChunk: [...rest], independent, complete, tokenizationPerformed: false }, null, 2));
