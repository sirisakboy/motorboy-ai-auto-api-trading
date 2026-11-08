const fs = require('fs');

let g = fs.readFileSync('src/services/geminiService.ts', 'utf8');
g = g.replace(/source: 'GEMINI_AI',/g, "");
g = g.replace(/source: 'TECHNICAL_FALLBACK',/g, "");
g = g.replace(/timestamp:/g, "source: 'GEMINI_AI', timestamp:"); // just a quick hack, wait, it will affect technical fallback as well. 

// Better way
