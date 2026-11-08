import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '10mb' }));

/** Shared Gemini model identifier */
const GEMINI_MODEL = 'gemini-3.1-flash-lite';

/** Helper to instantiate GoogleGenAI client on the server */
function getGeminiClient(userApiKey?: string) {
  const apiKey =
    userApiKey?.trim() ||
    process.env.GEMINI_API_KEY ||
    process.env.VITE_GEMINI_API_KEY;

  if (!apiKey || apiKey === 'dummy_key') {
    return null;
  }

  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

/** Extract JSON from response text safely */
function extractJsonFromText<T = Record<string, unknown>>(text: string): T | null {
  try {
    return JSON.parse(text) as T;
  } catch {
    // try stripping code fences
  }

  const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (codeBlockMatch && codeBlockMatch[1]) {
    try {
      return JSON.parse(codeBlockMatch[1].trim()) as T;
    } catch {
      // continue
    }
  }

  const firstBrace = text.indexOf('{');
  const lastBrace = text.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    const jsonCandidate = text.substring(firstBrace, lastBrace + 1);
    try {
      return JSON.parse(jsonCandidate) as T;
    } catch {
      // ignore
    }
  }

  const firstBracket = text.indexOf('[');
  const lastBracket = text.lastIndexOf(']');
  if (firstBracket !== -1 && lastBracket !== -1 && lastBracket > firstBracket) {
    const jsonCandidate = text.substring(firstBracket, lastBracket + 1);
    try {
      return JSON.parse(jsonCandidate) as T;
    } catch {
      // ignore
    }
  }

  return null;
}

// ============================================================================
// SERVER-SIDE GEMINI API ROUTES
// ============================================================================

/** 1. Test Gemini API Key */
app.post('/api/gemini/test-key', async (req, res) => {
  const { apiKey, userEmail } = req.body || {};
  const ai = getGeminiClient(apiKey);
  if (!ai) {
    return res.status(400).json({
      success: false,
      text: 'กรุณากรอก Gemini API-KEY ก่อนทำการทดสอบ',
    });
  }

  try {
    const response = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: 'ตอบสั้นๆ 1 บรรทัดภาษาไทย: ยืนยันสถานะการเชื่อมต่อ AI สำหรับระบบวิเคราะห์ตลาด',
      config: {
        tools: [{ googleSearch: {} }],
      },
    });

    if (!response?.text) throw new Error('No response from Gemini model');
    const emailNotice = userEmail ? ` (เชื่อมโยงกับบัญชี ${userEmail})` : '';

    return res.json({
      success: true,
      text: `เชื่อมต่อ Gemini API สำเร็จ!${emailNotice} คีย์พร้อมใช้งานสมบูรณ์ ✓`,
      searchGrounded: true,
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      text: `เชื่อมต่อไม่สำเร็จ: ${error?.message || 'Invalid API Key'}`,
    });
  }
});

/** 2. Fetch Market Sentiment Score */
app.post('/api/gemini/sentiment', async (req, res) => {
  const { apiKey, coin, signal } = req.body || {};
  const ai = getGeminiClient(apiKey);
  if (!ai || !coin) {
    return res.status(400).json({ error: 'Missing Gemini API Key or Coin data' });
  }

  try {
    const prompt = `คุณคือผู้เชี่ยวชาญด้าน Crypto Market Sentiment และ On-chain Analytics
โปรดประเมินคะแนน Market Sentiment Score (0 ถึง 100) สำหรับเหรียญต่อไปนี้:
- เหรียญ: ${coin.name} (${coin.symbol})
- ราคาปัจจุบัน: $${coin.price}
- การเปลี่ยนแปลง 24 ชั่วโมง: ${coin.change}%
- ราคาสูงสุด 24 ชม.: $${coin.high || 'N/A'}
- ราคาต่ำสุด 24 ชม.: $${coin.low || 'N/A'}
- ปริมาณการซื้อขาย 24 ชม.: $${coin.volume ? coin.volume.toLocaleString() : 'N/A'}
${signal ? `- สัญญาณเทคนิค: ${signal.type} (ความน่าจะเป็น ${signal.probability}%)` : ''}

เกณฑ์คะแนน (0-100):
- 0-24: EXTREME_FEAR (ความกลัวขั้นสุด)
- 25-44: BEARISH (เชิงลบ / วิตกกังวล)
- 45-55: NEUTRAL (เป็นกลาง / พักตัวรอดูทิศทาง)
- 56-75: BULLISH (เชิงบวก / ความโลภปานกลาง)
- 76-100: EXTREME_GREED (ความโลภสูงสุด)

ตอบเป็นภาษาไทย ในรูปแบบ JSON ที่มี key ดังต่อไปนี้เท่านั้น:
{
  "score": ตัวเลขจำนวนเต็ม 0 ถึง 100,
  "sentimentLabel": "EXTREME_GREED" หรือ "BULLISH" หรือ "NEUTRAL" หรือ "BEARISH" หรือ "EXTREME_FEAR",
  "sentimentTextTh": "คำนิยามสั้นๆ ภาษาไทย เช่น 'กระทิงคึกคัก (Bullish)' หรือ 'พักฐานระมัดระวัง'",
  "summaryReason": "สรุปสั้น 1-2 ประโยค อธิบายสิ่งที่ขับเคลื่อน sentiment ของเหรียญนี้ในปัจจุบัน",
  "socialMomentum": "HIGH" หรือ "MODERATE" หรือ "LOW",
  "whaleActivity": "ACCUMULATION" หรือ "DISTRIBUTION" หรือ "NEUTRAL"
}`;

    const response = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }],
      },
    });

    const parsed = extractJsonFromText<any>(response.text || '{}');
    if (!parsed) throw new Error('Unparseable sentiment JSON');

    const score = Math.min(100, Math.max(0, Number(parsed.score) || 50));
    const safetyMargin = Math.max(5, Math.min(50, Number(parsed.safetyMargin) || Math.round((100 - score) * 0.35 + 8)));

    return res.json({
      score,
      sentimentLabel: parsed.sentimentLabel || 'NEUTRAL',
      sentimentTextTh: parsed.sentimentTextTh || 'เป็นกลาง',
      summaryReason: parsed.summaryReason || 'ประเมินจากราคาและสภาพคล่องตลาด',
      socialMomentum: parsed.socialMomentum || 'MODERATE',
      whaleActivity: parsed.whaleActivity || 'NEUTRAL',
      source: 'GEMINI_AI',
      safetyMargin,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || 'Gemini sentiment query failed' });
  }
});

/** 3. Analyze Market with Gemini */
app.post('/api/gemini/analyze-market', async (req, res) => {
  const { apiKey, coin, signal } = req.body || {};
  const ai = getGeminiClient(apiKey);
  if (!ai || !coin) {
    return res.status(400).json({ error: 'Missing Gemini API Key or Coin data' });
  }

  const isUp = coin.change >= 0;
  const isForex = coin.symbol.includes('/') || signal?.category === 'FOREX';
  const defaultSup = isForex ? (isUp ? coin.price * 0.994 : coin.price * 0.988) : (coin.low || coin.price * 0.955);
  const defaultRes = isForex ? (isUp ? coin.price * 1.012 : coin.price * 1.006) : (coin.high || coin.price * 1.045);

  try {
    const marketType = isForex ? 'Forex และเศรษฐศาสตร์มหภาคระดับสถาบันการเงินโลก' : 'Technical Analysis และกลยุทธ์การเทรดคริปโตเคอร์เรนซีระดับสถาบัน';
    const prompt = `คุณคือผู้เชี่ยวชาญด้าน ${marketType}
โปรดวิเคราะห์สินทรัพย์ต่อไปนี้ตามข้อมูลราคาตลาดแบบ Real-time:

- สินทรัพย์: ${coin.name} (${coin.symbol}) ${isForex ? '[Forex Pair]' : '[Crypto]'}
- ราคาปัจจุบัน: ${coin.price}
- เปลี่ยนแปลง 24 ชั่วโมง: ${coin.change}%
- ราคาสูงสุด 24 ชม.: ${coin.high || 'N/A'}
- ราคาต่ำสุด 24 ชม.: ${coin.low || 'N/A'}
- ปริมาณการซื้อขาย (Volume): ${coin.volume ? coin.volume.toLocaleString() : 'N/A'}
${signal ? `- สัญญาณเทคนิคระบบ: ${signal.type} (ความน่าจะเป็น ${signal.probability}%, SL: ${signal.sl}, TP: ${signal.tp})` : ''}

ตอบเป็นภาษาไทย โดยให้ผลลัพธ์ในรูปแบบ JSON ที่มี key ดังนี้เท่านั้น:
{
  "action": "LONG" หรือ "SHORT" หรือ "NEUTRAL",
  "confidence": ตัวเลข 50-98,
  "summary": "สรุปสภาวะตลาดและทิศทาง 2-3 ประโยค สั้นกระชับ ชัดเจน",
  "supportLevel": ตัวเลขราคาแนวรับ,
  "resistanceLevel": ตัวเลขราคาแนวต้าน,
  "strategyAdvice": "คำแนะนำการวางกลยุทธ์ การตั้ง SL/TP และการบริหารความเสี่ยง",
  "sentimentScore": ตัวเลขคะแนน Sentiment 0 ถึง 100,
  "sentimentLabel": "EXTREME_GREED" หรือ "BULLISH" หรือ "NEUTRAL" หรือ "BEARISH" หรือ "EXTREME_FEAR",
  "sentimentTextTh": "คำนิยามอารมณ์ตลาดภาษาไทย เช่น 'กระทิงคึกคัก'",
  "socialMomentum": "HIGH" หรือ "MODERATE" หรือ "LOW",
  "whaleActivity": "ACCUMULATION" หรือ "DISTRIBUTION" หรือ "NEUTRAL"
}`;

    const response = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }],
      },
    });

    const parsed = extractJsonFromText<any>(response.text || '{}');
    if (!parsed) throw new Error('Unparseable market analysis response');

    const sScore = Math.min(100, Math.max(0, Number(parsed.sentimentScore) || (coin.change >= 0 ? 68 : 38)));

    return res.json({
      symbol: coin.symbol,
      action: parsed.action || (coin.change >= 0 ? 'LONG' : 'SHORT'),
      confidence: Number(parsed.confidence) || 75,
      summary: parsed.summary || 'วิเคราะห์ตลาดเรียบร้อยแล้ว',
      supportLevel: Number(parsed.supportLevel) || defaultSup,
      resistanceLevel: Number(parsed.resistanceLevel) || defaultRes,
      strategyAdvice: parsed.strategyAdvice || 'ติดตามแนวโน้มอย่างใกล้ชิดและตั้ง SL เสมอ',
      sentiment: {
        score: sScore,
        sentimentLabel: parsed.sentimentLabel || (sScore >= 56 ? 'BULLISH' : 'BEARISH'),
        sentimentTextTh: parsed.sentimentTextTh || (sScore >= 56 ? 'เชิงบวก' : 'เชิงลบ'),
        summaryReason: parsed.summary || 'ประเมินจากราคาและสัญญาณเทคนิค',
        socialMomentum: parsed.socialMomentum || 'MODERATE',
        whaleActivity: parsed.whaleActivity || 'NEUTRAL',
        source: 'GEMINI_AI',
        safetyMargin: Math.max(5, Math.min(50, Number(parsed.safetyMargin) || Math.round((100 - sScore) * 0.35 + 8))),
        timestamp: new Date().toISOString(),
      },
      source: 'GEMINI_AI',
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || 'Gemini market analysis failed' });
  }
});

/** 4. Analyze News with Gemini */
app.post('/api/gemini/analyze-news', async (req, res) => {
  const { apiKey, article } = req.body || {};
  const ai = getGeminiClient(apiKey);
  if (!ai || !article) {
    return res.status(400).json({ error: 'Missing Gemini API Key or Article' });
  }

  try {
    const prompt = `คุณคือนักกลยุทธ์การเงินและนักวิเคราะห์มหภาคระดับสถาบัน (Institutional Macro & Quantitative Market Strategist)
มีภารกิจวิเคราะห์ข่าวสารการเงินและการลงทุนจากแหล่งข่าว "${article.source}" เพื่อให้คำแนะนำที่ "แม่นยำที่สุด" สำหรับเทรดเดอร์และนักลงทุน

ข้อมูลข่าว:
- หัวข้อข่าว: "${article.title}"
- แหล่งข่าว: "${article.source}"
- เวลาที่เผยแพร่: "${article.time}"
- หมวดหมู่: "${article.category || 'General Financial News'}"
- ลิงก์อ้างอิง: "${article.url}"

กรุณาวิเคราะห์ผลกระทบต่อตลาดอย่างละเอียด รอบคอบ และแม่นยำที่สุด โดยตอบเป็นภาษาไทยในรูปแบบ JSON มีโครงสร้างดังนี้เท่านั้น:
{
  "sentiment": "BULLISH" หรือ "BEARISH" หรือ "NEUTRAL",
  "sentimentLabelTh": "ระบุผลกระทบ เช่น 'เชิงบวกอย่างมีนัยสำคัญ (Strong Bullish)' หรือ 'ระมัดระวังแรงขาย (Cautious)'",
  "accuracyScore": ตัวเลขอัตราความแม่นยำ/ความมั่นใจในการประเมินระหว่าง 85 ถึง 98,
  "marketImpact": "HIGH" หรือ "MEDIUM" หรือ "LOW",
  "affectedMarkets": ["ระบุสินทรัพย์/ตลาดที่กระทบ เช่น 'SET Index (ตลาดหุ้นไทย)', 'USD/THB (ค่าเงินบาท)', 'Bitcoin / คริปโต', 'ทองคำ (Gold)'"],
  "impactHorizon": "SHORT_TERM" หรือ "MEDIUM_TERM" หรือ "LONG_TERM",
  "coreTakeaway": "สรุปสาระสำคัญของข่าว 1-2 ประโยค ชัดเจนและตรงประเด็นที่สุด",
  "marketImplication": "การวิเคราะห์ผลกระทบเชิงลึกต่อสภาพคล่อง, โครงสร้างราคา, และพฤติกรรมเงินทุนสถาบัน (Fund Flow)",
  "tradingStrategyAdvice": "กลยุทธ์การเทรดที่แนะนำอย่างแม่นยำ (จุดสังเกต, การเข้าสถานะ, การคุมความเสี่ยงและ Stop Loss)",
  "macroRisk": "LOW" หรือ "MODERATE" หรือ "ELEVATED" หรือ "HIGH",
  "volatilityForecast": "EXPANDING" หรือ "STABLE" หรือ "COMPRESSING",
  "recommendedPositioning": "ACCUMULATE" หรือ "HOLD" หรือ "REDUCE_RISK" หรือ "HEDGE",
  "riskFactors": ["ปัจจัยเสี่ยงข้อที่ 1 ที่ต้องจับตา", "ปัจจัยเสี่ยงข้อที่ 2 ที่ต้องจับตา"]
}`;

    const response = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }],
      },
    });

    const parsed = extractJsonFromText<any>(response.text || '{}');
    if (!parsed) throw new Error('Unparseable news analysis JSON');

    return res.json({
      newsId: article.id,
      title: article.title,
      source: article.source,
      url: article.url,
      sentiment: parsed.sentiment || article.sentiment || 'NEUTRAL',
      sentimentLabelTh: parsed.sentimentLabelTh || 'ประเมินเป็นกลางต่อตลาด',
      accuracyScore: Math.min(99, Math.max(80, Number(parsed.accuracyScore) || 92)),
      marketImpact: parsed.marketImpact || (article.impact || 'MEDIUM'),
      affectedMarkets: Array.isArray(parsed.affectedMarkets) && parsed.affectedMarkets.length > 0
        ? parsed.affectedMarkets
        : ['SET Index (ตลาดหุ้นไทย)', 'USD/THB (ค่าเงินบาท)'],
      impactHorizon: parsed.impactHorizon || 'SHORT_TERM',
      coreTakeaway: parsed.coreTakeaway || (article.summary || article.title),
      marketImplication: parsed.marketImplication || 'ข่าวนี้ส่งผลกระทบต่อความผันผวนระยะสั้นและกระแสเงินทุน',
      tradingStrategyAdvice: parsed.tradingStrategyAdvice || 'แนะนำรอจังหวะ Breakout ยืนยันแนวรับ-แนวต้าน',
      keyMetrics: {
        macroRisk: parsed.macroRisk || 'MODERATE',
        volatilityForecast: parsed.volatilityForecast || 'EXPANDING',
        recommendedPositioning: parsed.recommendedPositioning || 'HOLD',
      },
      riskFactors: Array.isArray(parsed.riskFactors) && parsed.riskFactors.length > 0
        ? parsed.riskFactors
        : ['ความผันผวนของอัตราแลกเปลี่ยนและค่าเงินดอลลาร์'],
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || 'Gemini news analysis failed' });
  }
});

/** 5. Holistic Market Stance */
app.post('/api/gemini/holistic-stance', async (req, res) => {
  const { apiKey, signals = [], newsList = [] } = req.body || {};
  const ai = getGeminiClient(apiKey);
  if (!ai) {
    return res.status(400).json({ error: 'Missing Gemini API Key' });
  }

  try {
    const topSignalsSummary = signals.slice(0, 8).map(
      (s: any) => `- ${s.symbol}: ${s.type} (ความน่าจะเป็น ${s.probability}%, ราคา $${s.price})`
    ).join('\n');

    const topNewsSummary = newsList.slice(0, 6).map(
      (n: any) => `- [${n.source}] ${n.title} (Sentiment: ${n.sentiment})`
    ).join('\n');

    const prompt = `คุณคือหัวหน้านักวิเคราะห์กลยุทธ์การลงทุนตลาดการเงินและสินทรัพย์ดิจิทัล (Chief Investment Officer & Quantitative Strategist)
มีภารกิจสรุปสภาวะตลาดแบบองค์รวม (Holistic Market Synthesis) โดยประมวลผลจากข้อมูลสด:

ชุดข้อมูลสัญญาณเทรด (${signals.length} สินทรัพย์):
${topSignalsSummary}

ชุดข้อมูลข่าวสารและดัชนีเศรษฐกิจ (${newsList.length} ข่าว):
${topNewsSummary}

โปรดประเมินสภาวะตลาดองค์รวม และให้คำแนะนำเด็ดขาดสั้นๆ ว่าตลาดควร 'Buy', 'Sell' หรือ 'Hold' โดยตอบเป็นภาษาไทยในรูปแบบ JSON โครงสร้างนี้เท่านั้น:
{
  "recommendation": "BUY" หรือ "SELL" หรือ "HOLD",
  "recommendationLabelTh": "คำภาษาไทยสั้นๆ เช่น 'เข้าซื้อสะสม (Buy)' หรือ 'ชะลอขายลดพอร์ต (Sell)' หรือ 'ถือเงินสดรอดูจังหวะ (Hold)'",
  "confidence": ตัวเลขเปอร์เซ็นต์ความมั่นใจ 70 ถึง 98,
  "marketStance": "สภาวะตลาดสรุปสั้น 1 ประโยค",
  "summaryReason": "เหตุผลประกอบคำแนะนำที่ชัดเจนและกระชับ 1-2 ประโยค",
  "keyDrivers": ["ปัจจัยขับเคลื่อนที่ 1", "ปัจจัยขับเคลื่อนที่ 2", "ปัจจัยขับเคลื่อนที่ 3"],
  "riskFactor": "ปัจจัยเสี่ยงสำคัญที่สุด 1 ข้อที่ต้องจับตาอย่างใกล้ชิด"
}`;

    const response = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }],
      },
    });

    const parsed = extractJsonFromText<any>(response.text || '{}');
    if (!parsed) throw new Error('Unparseable holistic stance response');

    const rec = (parsed.recommendation as string)?.toUpperCase();
    const validRec = rec === 'BUY' ? 'BUY' : rec === 'SELL' ? 'SELL' : 'HOLD';

    return res.json({
      recommendation: validRec,
      recommendationLabelTh: parsed.recommendationLabelTh || (validRec === 'BUY' ? 'เข้าซื้อสะสม (Buy)' : validRec === 'SELL' ? 'ชะลอขาย (Sell)' : 'ถือรอดูจังหวะ (Hold)'),
      confidence: Math.min(98, Math.max(65, Number(parsed.confidence) || 80)),
      marketStance: parsed.marketStance || 'ตลาดเคลื่อนไหวในกรอบสะสมกำลัง',
      summaryReason: parsed.summaryReason || 'ประเมินจากสัญญาณเทคนิคัลและกระแสข่าว',
      keyDrivers: Array.isArray(parsed.keyDrivers) && parsed.keyDrivers.length > 0 ? parsed.keyDrivers : ['โมเมนตัมตลาด', 'กระแสข่าวสาร'],
      riskFactor: parsed.riskFactor || 'ความผันผวนจากปัจจัยเศรษฐกิจมหภาค',
      bullishSignalsCount: signals.filter((s: any) => s.type === 'LONG').length,
      bearishSignalsCount: signals.filter((s: any) => s.type === 'SHORT').length,
      bullishNewsCount: newsList.filter((n: any) => n.sentiment === 'BULLISH').length,
      bearishNewsCount: newsList.filter((n: any) => n.sentiment === 'BEARISH').length,
      source: 'GEMINI_AI',
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || 'Gemini holistic stance query failed' });
  }
});

/** 6. Synthesize Hourly News & Signals for History */
app.post('/api/gemini/synthesize-hourly', async (req, res) => {
  const { apiKey, newsList = [], signals = [] } = req.body || {};
  const ai = getGeminiClient(apiKey);
  if (!ai) {
    return res.status(400).json({ error: 'Missing Gemini API Key' });
  }

  try {
    const topSignals = signals.slice(0, 6);
    const topNews = newsList.slice(0, 5);

    const prompt = `คุณคือระบบวิเคราะห์อัตโนมัติประจำชั่วโมง (Hourly Auto-Market Catalyst Synthesizer)
มีหน้าที่เปรียบเทียบข่าวสารการเงินล่าสุดกับสัญญาณซื้อขาย เพื่อสรุปสภาวะตลาดสำหรับบันทึกลง History ของผู้ใช้

ข่าวล่าสุด:
${topNews.map((n: any) => `- [${n.source}] ${n.title}`).join('\n')}

สัญญาณซื้อขาย:
${topSignals.map((s: any) => `- ${s.symbol}: ${s.type} (ราคา $${s.price})`).join('\n')}

ตอบเป็นภาษาไทย ในรูปแบบ JSON เท่านั้น:
{
  "headline": "พาดหัวสรุปสภาวะตลาดสั้นๆ 1 บรรทัด",
  "overallStance": "BULLISH" หรือ "BEARISH" หรือ "NEUTRAL",
  "overallStanceTh": "แนวโน้มภาษาไทย เช่น 'แนวโน้มขาขึ้น (Bullish Momentum)'",
  "confidence": ตัวเลขเปอร์เซ็นต์ความเชื่อมั่น 65-95,
  "keyCatalysts": ["ปัจจัยขับเคลื่อนที่ 1", "ปัจจัยขับเคลื่อนที่ 2"],
  "mostImpactedAssets": [
    { "symbol": "BTC", "expectedImpact": "POSITIVE", "reason": "เหตุผลสั้นๆ" }
  ],
  "riskHorizon": "ระยะสั้น 1-24 ชม.",
  "actionableSummary": "สรุปคำแนะนำสั้นกระชับสำหรับผู้ใช้"
}`;

    const response = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }],
      },
    });

    const parsed = extractJsonFromText<any>(response.text || '{}');
    if (!parsed) throw new Error('Unparseable synthesis response');

    return res.json({
      headline: parsed.headline || 'สรุปสภาวะตลาดประจำชั่วโมง',
      overallStance: parsed.overallStance || 'NEUTRAL',
      overallStanceTh: parsed.overallStanceTh || 'เป็นกลาง',
      confidence: Number(parsed.confidence) || 80,
      keyCatalysts: Array.isArray(parsed.keyCatalysts) ? parsed.keyCatalysts : ['ปัจจัยข่าวสารและราคาสด'],
      mostImpactedAssets: Array.isArray(parsed.mostImpactedAssets) ? parsed.mostImpactedAssets : [],
      riskHorizon: parsed.riskHorizon || 'ระยะสั้น 1-24 ชม.',
      actionableSummary: parsed.actionableSummary || 'ติดตามกรอบแนวรับแนวต้านอย่างใกล้ชิด',
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || 'Hourly synthesis failed' });
  }
});

/** 7. Long Term Project CAPEX Analysis */
app.post('/api/gemini/longterm-project', async (req, res) => {
  const { apiKey, article } = req.body || {};
  const ai = getGeminiClient(apiKey);
  if (!ai || !article) {
    return res.status(400).json({ error: 'Missing Gemini API Key or Article data' });
  }

  try {
    const details = article.projectDetails;
    const prompt = `คุณคือหัวหน้านักวิเคราะห์การลงทุนหุ้นคุณค่าและการลงทุนระยะยาว (Chief Fundamental & Infrastructure Analyst)
โปรดวิเคราะห์โครงการลงทุน/การขยายโรงงาน/โครงสร้างพื้นฐานขนาดยักษ์ (CAPEX Expansion) ดังต่อไปนี้:

- หัวข้อข่าว: "${article.title}"
- บริษัท/กลุ่มธุรกิจ: "${details?.company || 'N/A'}"
- ชื่อโครงการ/รายละเอียด: "${details?.projectName || article.title}"
- งบลงทุน (CAPEX): "${details?.capexValue || 'N/A'}"
- กำหนดเวลาการก่อสร้าง: "${details?.constructionTimeline || 'N/A'}"
- ผู้ได้รับผลประโยชน์หลัก: "${(details?.targetBeneficiaries || []).join(', ')}"

ตอบเป็นภาษาไทย ในรูปแบบ JSON เท่านั้น:
{
  "company": "${details?.company || 'N/A'}",
  "projectName": "${details?.projectName || article.title}",
  "capexValue": "${details?.capexValue || 'N/A'}",
  "constructionTimeline": "${details?.constructionTimeline || 'N/A'}",
  "paybackPeriod": "ระยะเวลาคืนทุนประเมิน เช่น 4.5 - 6 ปี",
  "roiProjection": "อัตราผลตอบแทนประเมิน (IRR) เช่น 12.5% - 15.0%",
  "economicMoat": "คูเมืองทางธุรกิจและเปรียบเทียบการแข่งขัน",
  "debtRiskAssessment": "ประเมินความเสี่ยงหนี้สินและการเพิ่มทุน",
  "longTermVerdict": "STRONG_ACCUMULATE" หรือ "ACCUMULATE" หรือ "WATCHLIST" หรือ "CAUTION",
  "longTermVerdictTh": "คำสรุปภาษาไทย เช่น 'สะสมระยะยาวแกร่ง (Strong Accumulate)'",
  "confidenceScore": ตัวเลข 75 ถึง 96,
  "coreDrivers": ["ปัจจัยหนุนที่ 1", "ปัจจัยหนุนที่ 2"],
  "strategicRisk": "ความเสี่ยงเชิงกลยุทธ์ที่ต้องติดตาม",
  "investmentHorizon": "ระยะเวลาถือครองที่แนะนำ เช่น 3 - 5 ปี",
  "strategyAdvice": "คำแนะนำการสะสมหุ้นสำหรับนักลงทุนระยะยาว"
}`;

    const response = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }],
      },
    });

    const parsed = extractJsonFromText<any>(response.text || '{}');
    if (!parsed) throw new Error('Unparseable project analysis JSON');

    return res.json({
      company: parsed.company || details?.company || 'N/A',
      projectName: parsed.projectName || details?.projectName || article.title,
      capexValue: parsed.capexValue || details?.capexValue || 'N/A',
      constructionTimeline: parsed.constructionTimeline || details?.constructionTimeline || 'N/A',
      paybackPeriod: parsed.paybackPeriod || '3-5 ปี',
      roiProjection: parsed.roiProjection || '11% - 14% IRR',
      economicMoat: parsed.economicMoat || 'คูเมืองแข็งแกร่งจากส่วนแบ่งตลาดและสัญญาระยะยาว',
      debtRiskAssessment: parsed.debtRiskAssessment || 'งบการเงินมีความมั่นคงและกระแสเงินสดรองรับ',
      longTermVerdict: parsed.longTermVerdict || 'ACCUMULATE',
      longTermVerdictTh: parsed.longTermVerdictTh || 'ทยอยสะสมระยะยาว (Accumulate)',
      confidenceScore: Number(parsed.confidenceScore) || 88,
      coreDrivers: Array.isArray(parsed.coreDrivers) ? parsed.coreDrivers : ['การขยายกำลังการผลิต', 'รายได้ Recurring Income'],
      strategicRisk: parsed.strategicRisk || 'การล่าช้าของการก่อสร้างและต้นทุนวัตถุดิบ',
      investmentHorizon: parsed.investmentHorizon || '3 - 5 ปี',
      strategyAdvice: parsed.strategyAdvice || 'แนะนำทยอยสะสมเมื่อราคาย่อตัวลงมาใกล้แนวรับ',
      source: 'GEMINI_AI',
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || 'Project CAPEX analysis failed' });
  }
});

/** 8. Categorize Headlines with Gemini */
app.post('/api/gemini/categorize-headlines', async (req, res) => {
  const { articles = [], apiKey } = req.body || {};
  const ai = getGeminiClient(apiKey);
  if (!ai || articles.length === 0) {
    return res.status(400).json({ error: 'Missing Gemini API Key or articles array' });
  }

  const headlinesToAnalyze = articles.slice(0, 15);

  try {
    const prompt = `You are a senior financial analyst. Categorize the market impact of each global financial headline below into exactly one of three categories: "HIGH", "MEDIUM", or "LOW".

Headlines:
${headlinesToAnalyze.map((a: any, i: number) => `${i + 1}. [ID: ${a.id || i}] ${a.title}`).join('\n')}

Respond ONLY with valid JSON array of objects:
[
  { "id": "1", "impact": "HIGH" },
  { "id": "2", "impact": "MEDIUM" }
]`;

    const response = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
      },
    });

    const parsed = extractJsonFromText<any[]>(response.text || '[]');
    if (!Array.isArray(parsed)) throw new Error('Unparseable headlines array');

    const impactMap = new Map<string, 'HIGH' | 'MEDIUM' | 'LOW'>();
    parsed.forEach((item: any, idx: number) => {
      const id = String(item.id || headlinesToAnalyze[idx]?.id || idx);
      const impact = (item.impact || '').toUpperCase();
      if (['HIGH', 'MEDIUM', 'LOW'].includes(impact)) {
        impactMap.set(id, impact as 'HIGH' | 'MEDIUM' | 'LOW');
      }
    });

    const updated = articles.map((art: any, idx: number) => {
      const matchedImpact = impactMap.get(art.id) || impactMap.get(String(idx + 1));
      return {
        ...art,
        impact: matchedImpact || art.impact || 'LOW',
      };
    });

    return res.json({ articles: updated });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || 'Headlines categorization failed' });
  }
});

/** 9. Call Gemini for Chat Reply */
app.post('/api/gemini/chat-reply', async (req, res) => {
  const { query, marketBrief, geminiApiKey } = req.body || {};
  const ai = getGeminiClient(geminiApiKey);

  if (!ai) {
    return res.status(400).json({ error: 'Missing Gemini API Key' });
  }

  const prompt = `คุณคือ MotorBoy AI-TH (น้องมอเตอร์บอย) AI Trading Co-Pilot + Auto API Assistant, Hybrid Pro จาก MotorBoy Studio AI-TH
สโลแกน: "AI auto API Trading - เร็ว แม่น ปลอดภัย แบบ MotorBoy"
บุคลิก: พี่ชายนักบิดมือโปร (pro_rider_brother) — รวดเร็ว แม่นยำ เป็นมิตร มีวินัยสูง ชัดเจน ไม่มีน้ำ
หลักการ 5 เสาหลัก:
1. ENGINE: วิเคราะห์แนวโน้ม แท่งเทียน Volume แนวรับ/แนวต้าน อย่างแม่นยำ
2. API MODE: วางแผนการเทรด มี Entry, SL, TP1/TP2 และ RR Ratio ชัดเจนเสมอ
3. RISK GUARD: คุมความเสี่ยงไม่เกิน 2% ต่อไม้ อัตรา RR Ratio ไม่ต่ำกว่า 1:1.5 ถ้าความเสี่ยงเกิน 2% ให้ปฏิเสธและเตือนทันที
4. KILL SWITCH: ถ้าตลาดผันผวนรุนแรง หรือ Drawdown เกิน 5% ให้หยุดและบอก "🛑 เบรกก่อนจิ!"
5. กฎเหล็ก: ห้ามการันตีผลกำไรเด็ดขาด และต้องปิดท้ายด้วยข้อความ: "นี่คือการวิเคราะห์ ไม่ใช่คำแนะนำการลงทุน" เสมอ
คำพูดติดปากเมื่อเจอจุดเข้าที่ดี: "🏍️ Full Throttle! จุดเข้าตามแผน ล็อคความเสี่ยงเรียบร้อย"

ข้อมูลตลาดสดประกอบการวิเคราะห์:
${marketBrief || 'ไม่มีข้อมูลตลาดสดเพิ่มเติม'}

คำถามจากผู้ใช้: "${query}"
`.trim();

  try {
    const response = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }],
      },
    });

    if (response?.text) {
      return res.json({ reply: response.text, source: 'GEMINI_AI' });
    }
    return res.status(500).json({ error: 'Empty response from Gemini' });
  } catch (err: any) {
    console.warn('Server Gemini chat query error:', err?.message);
    return res.status(500).json({ error: err?.message || 'Gemini chat query failed' });
  }
});

// ============================================================================
// VITE MIDDLEWARE & SERVER INITIALIZATION
// ============================================================================

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true, host: '0.0.0.0', port: Number(PORT) },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, 'dist')));
    app.use((_req, res) => {
      res.sendFile(path.join(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(Number(PORT), '0.0.0.0', () => {
    console.log(`Server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
