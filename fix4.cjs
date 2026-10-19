const fs = require('fs');
let content = fs.readFileSync('src/services/geminiService.ts', 'utf8');

content = content.replace(/export interface MarketSentimentScore \{[\s\S]*?timestamp: string;\n\}/, `export interface MarketSentimentScore {
  score: number;
  sentimentLabel: 'EXTREME_GREED' | 'BULLISH' | 'NEUTRAL' | 'BEARISH' | 'EXTREME_FEAR';
  sentimentTextTh: string;
  summaryReason: string;
  socialMomentum: 'HIGH' | 'MODERATE' | 'LOW';
  whaleActivity: 'ACCUMULATION' | 'DISTRIBUTION' | 'NEUTRAL';
  source: 'GEMINI_AI' | 'TECHNICAL_FALLBACK';
  timestamp: string;
}`);

content = content.replace(/export interface AiAnalysisResult \{[\s\S]*?timestamp: string;\n\}/, `export interface AiAnalysisResult {
  symbol: string;
  action: 'LONG' | 'SHORT' | 'ALERT' | 'NEUTRAL';
  confidence: number;
  summary: string;
  supportLevel: number;
  resistanceLevel: number;
  strategyAdvice: string;
  keyDrivers?: string[];
  risks?: string[];
  source: 'GEMINI_AI' | 'TECHNICAL_FALLBACK';
  timestamp: string;
}`);

content = content.replace(/analysisSource:/g, "source:");

fs.writeFileSync('src/services/geminiService.ts', content);

let tContent = fs.readFileSync('src/types.ts', 'utf8');
tContent = tContent.replace(/analysisSource:/g, "source:");
fs.writeFileSync('src/types.ts', tContent);

