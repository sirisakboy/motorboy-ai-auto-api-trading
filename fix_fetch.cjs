const fs = require('fs');

let content = fs.readFileSync('src/services/apiClient.ts', 'utf8');

// Replace fetchPriceHistory
content = content.replace(/export async function fetchPriceHistory\([\s\S]*?return \{\s*prices: simulated,[\s\S]*?ema50: calculateEma\(simulated, 50\),\s*\};\s*\}/, `export async function fetchPriceHistory(symbolId: string, isForex = false): Promise<ChartData> {
  const target = !isForex ? CRYPTO_INITIAL.find(c => c.id === symbolId || c.symbol === symbolId) : undefined;
  
  if (!isForex && target) {
    try {
      const url = \`https://api.binance.com/api/v3/klines?symbol=\${target.binanceSymbol}&interval=1d&limit=90\`;
      const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
      if (res.ok) {
        const array = await res.json();
        if (Array.isArray(array) && array.length > 0) {
          const prices = array.map((c: any) => parseFloat(c[4]) || 0);
          const ema20 = calculateEma(prices, 20);
          const ema50 = calculateEma(prices, 50);
          
          const sorted = [...prices].sort((a, b) => a - b);
          const support = sorted[Math.floor(sorted.length * 0.1)] || Math.min(...prices);
          const resistance = sorted[Math.floor(sorted.length * 0.9)] || Math.max(...prices);
          
          return { prices, ema20, ema50, support, resistance };
        }
      }
    } catch {
      // Fallback
    }
  }

  // Fallback or Forex simulation
  let basePrice = 65000.0;
  if (!isForex && target && target.price > 0) {
    basePrice = target.price;
  } else if (isForex) {
    // For forex, try to make a realistic looking price
    basePrice = symbolId.includes('THB') ? 34.5 : symbolId.includes('JPY') ? 150.0 : 1.1;
  }
  
  const simulated = Array.from({ length: 90 }, (_, i) => {
    // Add some random noise and trend
    const noise = (Math.random() - 0.5) * 0.05;
    return basePrice * (0.92 + 0.16 * Math.sin(i * 0.1) + (i * 0.001) + noise);
  });
  
  const sortedSim = [...simulated].sort((a, b) => a - b);
  const support = sortedSim[Math.floor(sortedSim.length * 0.1)] || Math.min(...simulated);
  const resistance = sortedSim[Math.floor(sortedSim.length * 0.9)] || Math.max(...simulated);

  return {
    prices: simulated,
    ema20: calculateEma(simulated, 20),
    ema50: calculateEma(simulated, 50),
    support,
    resistance
  };
}`);

fs.writeFileSync('src/services/apiClient.ts', content);
