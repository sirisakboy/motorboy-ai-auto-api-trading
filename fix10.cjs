const fs = require('fs');

let g = fs.readFileSync('src/services/geminiService.ts', 'utf8');

g = g.replace(/source: 'GEMINI_AI',\s*source: 'GEMINI_AI',/g, "source: 'GEMINI_AI',");
g = g.replace(/source: 'TECHNICAL_FALLBACK',\s*source: 'TECHNICAL_FALLBACK',/g, "source: 'TECHNICAL_FALLBACK',");

fs.writeFileSync('src/services/geminiService.ts', g);
