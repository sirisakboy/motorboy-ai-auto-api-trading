const fs = require('fs');
let sContent = fs.readFileSync('src/services/geminiService.ts', 'utf8');
sContent = sContent.replace(/source: 'GEMINI_AI',/g, "analysisSource: 'GEMINI_AI',");
sContent = sContent.replace(/source: 'TECHNICAL_FALLBACK',/g, "analysisSource: 'TECHNICAL_FALLBACK',");
sContent = sContent.replace(/export interface MarketSentimentScore \{/g, "export interface MarketSentimentScore {\n  analysisSource?: 'GEMINI_AI' | 'TECHNICAL_FALLBACK';");
sContent = sContent.replace(/export interface AiAnalysisResult \{/g, "export interface AiAnalysisResult {\n  analysisSource?: 'GEMINI_AI' | 'TECHNICAL_FALLBACK';\n  keyDrivers?: string[];\n  risks?: string[];");
fs.writeFileSync('src/services/geminiService.ts', sContent);
