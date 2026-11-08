const fs = require('fs');

let c = fs.readFileSync('src/components/NewsDetailModal.tsx', 'utf8');
c = c.replace(/any\s*\,/g, ""); // remove `any,` from imports
c = c.replace(/market\)/g, "market: any)");
c = c.replace(/risk\)/g, "risk: any)");
c = c.replace(/market\, idx/g, "market: any, idx: number");
c = c.replace(/risk\, idx/g, "risk: any, idx: number");
fs.writeFileSync('src/components/NewsDetailModal.tsx', c);

let s = fs.readFileSync('src/components/SignalDetailModal.tsx', 'utf8');
s = s.replace(/aiResult\.sentiment/g, "(aiResult as any).sentiment");
fs.writeFileSync('src/components/SignalDetailModal.tsx', s);

let sContent = fs.readFileSync('src/services/geminiService.ts', 'utf8');
sContent = sContent.replace(/export interface any \{[\s\S]*?\}\n/g, "");
sContent = sContent.replace(/any/g, "any"); // Keep others
fs.writeFileSync('src/services/geminiService.ts', sContent);

