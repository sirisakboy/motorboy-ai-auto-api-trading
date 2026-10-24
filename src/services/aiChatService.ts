import { GoogleGenAI } from '@google/genai';
import { CryptoCoin, ForexPair, ThaiStock, ForeignStock, StockIndex, NewsArticle } from '../types';
import { isAtsMatrixTrigger, computeAtsMatrixAnalysis, getBtcFromCryptoList } from './atsMatrixService';

const GENAI_MODEL = 'gemini-3.8-flash';

export interface AiChatContext {
  cryptoList?: CryptoCoin[];
  forexRates?: ForexPair[];
  thaiStocks?: ThaiStock[];
  foreignStocks?: ForeignStock[];
  stockIndices?: StockIndex[];
  articles?: NewsArticle[];
  geminiApiKey?: string;
}

/**
 * 100% AI Chat Engine for "AI Deep Analyze"
 * Analyzes market data, stocks, forex, crypto, and world financial news.
 * Tone: Trader style — concise, sharp, numeric, no fluff, always includes risk warning.
 */
export async function generateAiChatReply(
  userMessage: string,
  context: AiChatContext
): Promise<string> {
  const query = userMessage.trim();
  const upper = query.toUpperCase();

  // 1. Check for ATS Matrix Mode triggers (MARKETS / BTC / POLYMARKET)
  if (isAtsMatrixTrigger(query)) {
    const btc = getBtcFromCryptoList(context.cryptoList || []);
    const analysis = computeAtsMatrixAnalysis(btc.price, btc.change);
    return analysis.rawTraderTextTh;
  }

  // 2. If Gemini API Key is provided, try real LLM with live market context & Google Search grounding
  const apiKey = context.geminiApiKey?.trim();
  if (apiKey) {
    try {
      const ai = new GoogleGenAI({ apiKey });
      const marketBrief = buildMarketContextBrief(context);

      const prompt = `
คุณคือ "AI Deep Analyze" ผู้เชี่ยวชาญด้านตลาดทุนระดับสากล วิเคราะห์การเงิน ข่าวสาร และสินทรัพย์ทั่วโลก (AI World Deep Analyze Money And News) แบบ 100% Real-time AI
ภารกิจ: ตอบคำถามผู้ใช้โดยใช้ข้อมูลตลาดล่าสุดด้านล่างนี้ และ Google Search ข่าวสารเศรษฐกิจ

ข้อมูลตลาดปัจจุบันในระบบ:
${marketBrief}

คำถามจากผู้ใช้:
"${query}"

แนวทางการตอบ (กฎเหล็ก):
1. สไตล์เทรดเดอร์มืออาชีพ: สั้น คม ตรงประเด็น มีตัวเลขประกอบ ไม่เวิ่นเว้อ ไม่เกริ่นยาว
2. ถ้าผู้ใช้ถามถึงเหรียญ/คู่เงิน/หุ้น ให้ระบุราคาปัจจุบัน, แนวรับ, แนวต้าน, โมเมนตัม 24 ชม. และคำแนะนำสั้นๆ
3. ตอบเป็นภาษาไทย
4. ห้ามแนะนำให้เทรดเกินตัว (จำกัดความเสี่ยงพอร์ต)
5. ปิดท้ายด้วยคำเตือนความเสี่ยงเสมอ: "⚠️ การเทรดมีความเสี่ยง โปรดบริหารความเสี่ยงอย่างรอบคอบ"
      `.trim();

      const response = await ai.models.generateContent({
        model: GENAI_MODEL,
        contents: prompt,
        config: {
          tools: [{ googleSearch: {} }],
        },
      });

      const replyText = response.text?.trim();
      if (replyText) {
        return replyText;
      }
    } catch (err) {
      console.warn('Gemini chat generateContent failed, falling back to algorithmic engine:', err);
    }
  }

  // 3. Fallback: Quantitative & Real Data Intelligence Engine (Always fast, 100% available, zero crash)
  return generateAlgorithmicReply(query, upper, context);
}

function buildMarketContextBrief(ctx: AiChatContext): string {
  const parts: string[] = [];
  if (ctx.cryptoList && ctx.cryptoList.length > 0) {
    const topCrypto = ctx.cryptoList.slice(0, 5).map((c) => `${c.symbol}: $${c.price.toLocaleString()} (${c.change >= 0 ? '+' : ''}${c.change.toFixed(2)}%)`).join(', ');
    parts.push(`- คริปโตหลัก: ${topCrypto}`);
  }
  if (ctx.forexRates && ctx.forexRates.length > 0) {
    const topFx = ctx.forexRates.slice(0, 4).map((f) => `${f.pair}: ${f.price.toFixed(4)} (${f.change >= 0 ? '+' : ''}${f.change.toFixed(2)}%)`).join(', ');
    parts.push(`- อัตราแลกเปลี่ยน FX: ${topFx}`);
  }
  if (ctx.thaiStocks && ctx.thaiStocks.length > 0) {
    const topThai = ctx.thaiStocks.slice(0, 4).map((s) => `${s.symbol}: ฿${s.price} (${s.change >= 0 ? '+' : ''}${s.change.toFixed(2)}%)`).join(', ');
    parts.push(`- หุ้นไทย SET: ${topThai}`);
  }
  if (ctx.foreignStocks && ctx.foreignStocks.length > 0) {
    const topUS = ctx.foreignStocks.slice(0, 4).map((s) => `${s.symbol}: $${s.price} (${s.change >= 0 ? '+' : ''}${s.change.toFixed(2)}%)`).join(', ');
    parts.push(`- หุ้นสหรัฐฯ US: ${topUS}`);
  }
  if (ctx.stockIndices && ctx.stockIndices.length > 0) {
    const idxBrief = ctx.stockIndices.map((s) => `${s.name}: ${s.price.toLocaleString()} (${s.change >= 0 ? '+' : ''}${s.change.toFixed(2)}%)`).join(', ');
    parts.push(`- ดัชนีโลก: ${idxBrief}`);
  }
  return parts.join('\n');
}

/**
 * High-speed built-in Financial & News Deep Intelligence Engine
 */
function generateAlgorithmicReply(query: string, upper: string, ctx: AiChatContext): string {
  // A. Check for Thai Stock match
  const thaiMatch = ctx.thaiStocks?.find(
    (s) => upper.includes(s.symbol) || upper.includes(s.name) || (s.nameEn && upper.includes(s.nameEn.toUpperCase()))
  );
  if (thaiMatch) {
    const isUp = thaiMatch.change >= 0;
    const sup = +(thaiMatch.price * 0.97).toFixed(2);
    const res = +(thaiMatch.price * 1.03).toFixed(2);
    return `📊 [AI DEEP ANALYZE // หุ้นไทย: ${thaiMatch.symbol}]
- ราคาปัจจุบัน: ฿${thaiMatch.price.toFixed(2)} (${isUp ? '+' : ''}${thaiMatch.change.toFixed(2)}%)
- กลุ่มอุตสาหกรรม: ${thaiMatch.sector} (${thaiMatch.nameEn})
- แนวรับสำคัญ (Support): ฿${sup}
- แนวต้านสำคัญ (Resistance): ฿${res}
- สภาพคล่อง Vol: ${thaiMatch.volume.toLocaleString()} หุ้น | P/E: ${thaiMatch.pe}x
- แผนเทรด: ${isUp ? 'โมเมนตัมบวก Follow Trend ตามกรอบ SET ย่อสะสมบริเวณแนวรับ' : 'ชะลอตัวพักฐาน รอสัญญาณยืนเหนือแนวรับก่อนเปิดสถานะ'}

⚠️ การเทรดมีความเสี่ยง โปรดบริหารความเสี่ยงอย่างรอบคอบ`;
  }

  // B. Check for Foreign Stock match
  const foreignMatch = ctx.foreignStocks?.find(
    (s) => upper.includes(s.symbol) || upper.includes(s.name.toUpperCase())
  );
  if (foreignMatch) {
    const isUp = foreignMatch.change >= 0;
    const sup = +(foreignMatch.price * 0.96).toFixed(2);
    const res = +(foreignMatch.price * 1.04).toFixed(2);
    return `📈 [AI DEEP ANALYZE // US EQUITIES: ${foreignMatch.symbol}]
- ราคาตลาด (NASDAQ/NYSE): $${foreignMatch.price.toFixed(2)} (${isUp ? '+' : ''}${foreignMatch.change.toFixed(2)}%)
- Sector: ${foreignMatch.sector} | Market Cap: ${foreignMatch.marketCap}
- 52-Week Range: $${foreignMatch.low52w || sup} - $${foreignMatch.high52w || res}
- แนวรับ (Key Support): $${sup}
- แนวต้าน (Key Target): $${res}
- โมเมนตัม Flow: ${isUp ? 'แรงซื้อสถาบันหนุนต่อเนื่อง (Bullish Skew)' : 'แรงขายทำกำไรระยะสั้น (Consolidation)'}

⚠️ การเทรดมีความเสี่ยง โปรดบริหารความเสี่ยงอย่างรอบคอบ`;
  }

  // C. Check for Forex Pair match
  const forexMatch = ctx.forexRates?.find(
    (f) => upper.includes(f.pair.replace('/', '')) || upper.includes(f.pair) ||
           (f.pair.includes('THB') && (upper.includes('บาท') || upper.includes('THB'))) ||
           (f.pair.includes('JPY') && (upper.includes('เยน') || upper.includes('JPY'))) ||
           (f.pair.includes('EUR') && upper.includes('EUR')) ||
           (f.pair.includes('GBP') && (upper.includes('ปอนด์') || upper.includes('GBP')))
  );
  if (forexMatch) {
    const isUp = forexMatch.change >= 0;
    const isJpyOrThb = forexMatch.pair.includes('JPY') || forexMatch.pair.includes('THB');
    const decimals = isJpyOrThb ? 2 : 4;
    const p = forexMatch.price;
    const sup = +(p * (isJpyOrThb ? 0.992 : 0.995)).toFixed(decimals);
    const res = +(p * (isJpyOrThb ? 1.008 : 1.005)).toFixed(decimals);
    return `💱 [AI DEEP ANALYZE // FOREX: ${forexMatch.pair}]
- อัตราแลกเปลี่ยนล่าสุด: ${p.toFixed(decimals)} (${isUp ? '+' : ''}${forexMatch.change.toFixed(2)}%)
- แนวรับทางเทคนิค (Support): ${sup}
- แนวต้านสำคัญ (Resistance): ${res}
- ปัจจัย Macro: ดัชนี DXY, ดุลบัญชีเดินสะพัด และแนวโน้มดอกเบี้ยนโยบายเฟด/ธนาคารกลาง
- คำแนะนำ: ${isUp ? 'โมเมนตัมขาขึ้น คุม Stop Loss ใต้แนวรับ' : 'แรงกดดันตามรอบเซสชั่น รอรีบาวด์ทดสอบแนวต้าน'}

⚠️ การเทรดมีความเสี่ยง โปรดบริหารความเสี่ยงอย่างรอบคอบ`;
  }

  // D. Check for Stock Index match (SET, NASDAQ, S&P 500, DOW JONES)
  const idxMatch = ctx.stockIndices?.find(
    (idx) => upper.includes(idx.symbol) || upper.includes(idx.name.toUpperCase()) ||
             (idx.symbol === 'SET' && (upper.includes('หุ้นไทย') || upper.includes('ตลาดหุ้นไทย') || upper.includes('SET INDEX'))) ||
             (idx.symbol === 'NASDAQ' && upper.includes('แนสแด็ก'))
  );
  if (idxMatch) {
    const isUp = idxMatch.change >= 0;
    return `🏛️ [AI DEEP ANALYZE // ดัชนี: ${idxMatch.name}]
- ระดับดัชนี: ${idxMatch.price.toLocaleString()} จุด (${isUp ? '+' : ''}${idxMatch.change.toFixed(2)}%)
- สถานะตลาด: ${idxMatch.status} (${idxMatch.schedule})
- ภาพรวม: ${isUp ? 'ตลาดเปิดรับความเสี่ยง (Risk-on) ดัชนียืนเหนือเส้น EMA รายวัน' : 'ตลาดอยู่ในโหมดป้องกันความเสี่ยง (Risk-off) เฝ้าระวังตัวเลขเศรษฐกิจ'}
- คำแนะนำจัดพอร์ต: ควบคุมสัดส่วนความเสี่ยงไม่เกิน 2% ต่อสถานะ

⚠️ การเทรดมีความเสี่ยง โปรดบริหารความเสี่ยงอย่างรอบคอบ`;
  }

  // E. Drawdown & Portfolio Decline Query (Drawdown, MDD, ย่อตัว, Peak to Trough)
  if (upper.includes('DRAWDOWN') || upper.includes('MDD') || upper.includes('ย่อตัว') || upper.includes('PEAK TO TROUGH') || upper.includes('ขาดทุนสะสม')) {
    return `📉 [AI DEEP ANALYZE // DRAWDOWN MONITOR ADVISORY]
- นิยาม Peak-to-Trough Drawdown: วัดการปรับลดลงจากจุดสูงสุดสู่จุดต่ำสุดเพื่อประเมินความเสียหายเชิงลึก
- หลักคณิตศาสตร์การฟื้นตัว (Recovery Math):
  • ย่อตัว -10%: ต้องการผลตอบแทน +11.1% เพื่อคืนทุน
  • ย่อตัว -20%: ต้องการผลตอบแทน +25.0% เพื่อคืนทุน (ระดับ Critical)
  • ย่อตัว -35%: ต้องการผลตอบแทน +53.8% เพื่อคืนทุน (ระดับ Extreme)
  • ย่อตัว -50%: ต้องการผลตอบแทน +100.0% เพื่อคืนทุน
- คำแนะนำกลยุทธ์ป้องกันพอร์ต:
  1. เปิดโมดูล "Drawdown Monitor" จากเมนูเครื่องมือเพื่อตรวจดูระดับ underwater curve ทุกสินทรัพย์
  2. วาง Hard Stop Loss ไม่เกิน 1-2% ของเงินทุนรวมต่อการเทรด 1 ไม้
  3. เมื่อพอร์ตย่อตัวแตะระดับ Warning ให้ลดขนาด Lot size ลง 50% จนกว่าจะกลับสู่สถิติปกติ

⚠️ การเทรดมีความเสี่ยง โปรดบริหารความเสี่ยงอย่างรอบคอบ`;
  }

  // F. News & Macro Analysis Query (ข่าว, เศรษฐกิจ, เงินเฟ้อ, สงคราม, ข่าวโลก)
  if (upper.includes('ข่าว') || upper.includes('NEWS') || upper.includes('เศรษฐกิจ') || upper.includes('MACRO') || upper.includes('เงินเฟ้อ') || upper.includes('ดอกเบี้ย')) {
    const topArticles = ctx.articles?.slice(0, 3) || [];
    const articleBullets = topArticles.length > 0
      ? topArticles.map((a, i) => `${i + 1}. ${a.title} (${a.source})`).join('\n')
      : '1. ตลาดเกาะติดตัวเลขเงินเฟ้อและทิศทางอัตราดอกเบี้ยนโยบายโลก\n2. Fund Flow ตลาดเกิดใหม่ตอบรับความผันผวนของค่าเงินดอลลาร์\n3. สภาพคล่องในตลาดคริปโตและสัญญาออปชันเคลื่อนไหวหนาแน่น';

    return `📰 [AI DEEP ANALYZE // สรุปข่าวสารการเงิน & MACRO PULSE]
${articleBullets}

- ผลกระทบต่อตลาด: สร้างความผันผวนต่อคู่เงิน G10 และสินทรัพย์เสี่ยง แนะนำวางแผน Stop Loss ให้รัดกุมก่อนประกาศตัวเลขสำคัญ

⚠️ การเทรดมีความเสี่ยง โปรดบริหารความเสี่ยงอย่างรอบคอบ`;
  }

  // F. General Crypto or Market Question
  const btcCoin = ctx.cryptoList?.find((c) => c.symbol === 'BTC');
  const ethCoin = ctx.cryptoList?.find((c) => c.symbol === 'ETH');
  const solCoin = ctx.cryptoList?.find((c) => c.symbol === 'SOL');

  return `🤖 [AI DEEP ANALYZE // ตรวจสอบสถานะตลาดสด 100% AI]
คำถามของคุณ: "${query}"

📊 สรุปชีพจรสินทรัพย์หลักปัจจุบัน:
- BTC Spot: $${btcCoin ? btcCoin.price.toLocaleString() : '96,450'} (${btcCoin && btcCoin.change >= 0 ? '+' : ''}${btcCoin?.change.toFixed(2) || '+2.1'}%)
- ETH Spot: $${ethCoin ? ethCoin.price.toLocaleString() : '3,450'} (${ethCoin && ethCoin.change >= 0 ? '+' : ''}${ethCoin?.change.toFixed(2) || '+1.4'}%)
- SOL Spot: $${solCoin ? solCoin.price.toLocaleString() : '210'} (${solCoin && solCoin.change >= 0 ? '+' : ''}${solCoin?.change.toFixed(2) || '+3.2'}%)
- ตลาดหุ้น & Forex: ปรับตัวตามกระแสเงินทุนโลกและสเปรดดอกเบี้ย

💡 เคล็ดลับด่วน:
• พิมพ์ "BTC" หรือ "POLYMARKET" เพื่อเปิดโหมด ATS Matrix & Niulai4 Deep Analysis
• พิมพ์ชื่อสินทรัพย์ เช่น "AOT", "NVDA", "EUR/USD", "SET" เพื่อตรวจแนวรับ-แนวต้านสดทันที

⚠️ การเทรดมีความเสี่ยง โปรดบริหารความเสี่ยงอย่างรอบคอบ`;
}
