const fs = require('fs');
let c = fs.readFileSync('src/services/apiClient.ts', 'utf8');

const newFn = `
export function generateForexSignals(rates: ForexPair[]): TradingSignal[] {
  return rates.map((forex, idx) => {
    const isLong = forex.change >= 0;
    const p = forex.price;
    const sl = isLong ? p * 0.995 : p * 1.005;
    const tp = isLong ? p * 1.015 : p * 0.985;
    
    const confidence = Math.max(55, Math.min(96, Math.floor(65 + Math.abs(forex.change) * 10)));
    const timeframes = ['สั้น 1-3วัน', 'กลาง 1-2สัปดาห์'];
    const timeframe = timeframes[idx % timeframes.length];
    
    const parts = forex.pair.split('/');
    const base = parts[0] || forex.pair;
    const quote = parts[1] || 'USD';
    
    return {
      id: forex.pair.replace('/', '').toLowerCase(),
      symbol: forex.pair,
      base,
      quote,
      type: isLong ? 'LONG' : 'SHORT',
      probability: confidence,
      timeframe,
      price: p,
      change: forex.change,
      statusText: isLong ? 'Strong Momentum (FX)' : 'Trend Reversal (FX)',
      reason: isLong ? 'Breakout Resistance' : 'Breaking Support',
      sources: ['Frankfurter', 'Technical Quant'],
      tags: ['Forex', 'Macro'],
      sl,
      tp,
      similarity: 75 + (idx % 20),
      etfFlow: 'Macro'
    };
  });
}
`;

c += '\n' + newFn;
fs.writeFileSync('src/services/apiClient.ts', c);
