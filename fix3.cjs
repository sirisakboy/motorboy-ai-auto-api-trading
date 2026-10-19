const fs = require('fs');

let tContent = fs.readFileSync('src/types.ts', 'utf8');
tContent = tContent.replace(/source: 'GEMINI_AI' \| 'TECHNICAL_FALLBACK';/g, "analysisSource: 'GEMINI_AI' | 'TECHNICAL_FALLBACK';");
fs.writeFileSync('src/types.ts', tContent);

let sContent = fs.readFileSync('src/services/geminiService.ts', 'utf8');
sContent = sContent.replace(/export interface MarketSentimentScore \{/g, "export interface MarketSentimentScore {\n  source?: 'GEMINI_AI' | 'TECHNICAL_FALLBACK';");
sContent = sContent.replace(/export interface AiAnalysisResult \{/g, "export interface AiAnalysisResult {\n  source?: 'GEMINI_AI' | 'TECHNICAL_FALLBACK';");

fs.writeFileSync('src/services/geminiService.ts', sContent);

let fContent = fs.readFileSync('src/components/ForexDetailModal.tsx', 'utf8');
fContent = fContent.replace(/aiResult\.keyDrivers\.map/g, "(aiResult.keyDrivers || []).map");
fContent = fContent.replace(/aiResult\.risks\.map/g, "(aiResult.risks || []).map");
fs.writeFileSync('src/components/ForexDetailModal.tsx', fContent);
