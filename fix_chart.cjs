const fs = require('fs');
let tContent = fs.readFileSync('src/types.ts', 'utf8');
tContent = tContent.replace(/export interface ChartData \{[\s\S]*?\}\n/, `export interface ChartData {
  prices: number[];
  ema20: number[];
  ema50: number[];
  support?: number;
  resistance?: number;
}\n`);
fs.writeFileSync('src/types.ts', tContent);
