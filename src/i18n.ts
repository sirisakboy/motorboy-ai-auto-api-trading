export type TranslationKeys = {
  common: {
    crypto: string;
    forex: string;
    thai_stocks: string;
    foreign_stocks: string;
    indices: string;
    live: string;
    backup: string;
    loading_auth: string;
    close_window: string;
    save: string;
    success: string;
    error: string;
  };
  auth: {
    welcome_title: string;
    welcome_desc: string;
    login_error_popup_closed: string;
    login_error_generic: string;
    sign_in_google: string;
  };
  trading: {
    price_alert_toast: string;
    graph_live: string;
    graph_backup: string;
    update_at: string;
    backup_price_info: string;
  };
  settings: {
    title: string;
    google_account: string;
    synced: string;
    google_search_info: string;
    live_grounding: string;
    api_section_title: string;
    api_section_desc: string;
    api_section_status_exists: string;
    api_section_status_missing: string;
    api_label: string;
    api_info: string;
    api_get_key: string;
    api_save_btn: string;
    api_test_btn: string;
    api_saving: string;
    api_testing: string;
    api_save_success: string;
    api_test_required: string;
    currency_label: string;
    currency_thb: string;
    currency_usd: string;
    notif_label: string;
    notif_on: string;
    notif_off: string;
    notif_btn_on: string;
    notif_btn_off: string;
    alert_title: string;
    alert_coin_label: string;
    alert_price_label: string;
    alert_save_btn: string;
    alert_saved_success: string;
    alert_list_header: string;
    alert_target: string;
    sync_footer: string;
  };
  risk_calc: {
    title: string;
    labels: {
      signal_picker: string;
      manual_entry: string;
      direction: string;
      account_size: string;
      risk_per_trade: string;
      entry_price: string;
      sl_price: string;
      rr_ratio: string;
      leverage: string;
    };
    checklist: {
      header: string;
      risk_limit_title: string;
      risk_limit_ok: string;
      risk_limit_fail: string;
      consistent_long_title: string;
      consistent_short_title: string;
      consistent_ok: string;
      consistent_fail: string;
      sl_dist_title: string;
      sl_dist_ok: string;
      sl_dist_fail: string;
      rr_title: string;
      rr_ok: string;
      rr_fail: string;
      lev_spot_title: string;
      lev_margin_title: string;
      lev_spot_tip: string;
      lev_margin_tip: string;
    },
    results: {
      notional: string;
      units: string;
      risk: string;
      reward: string;
      margin: string;
      summary: string;
      invalid_input: string;
    };
    ai: {
      header: string;
      desc: string;
      analyze_btn: string;
      analyze_loading: string;
      reanalyze_btn: string;
      api_missing: string;
      error: string;
    };
    save: {
      success: string;
      error: string;
      btn: string;
    };
  };
  signal_detail: {
    tabs: {
      ai: string;
      tech: string;
      risk: string;
      similarity: string;
    };
    sentiment: {
      header: string;
      whale_acc: string;
      whale_dist: string;
      whale_neutral: string;
      social_high: string;
      social_low: string;
      social_mid: string;
      loading: string;
    };
    ai_analysis: {
      forex_header: string;
      crypto_header: string;
      forex_desc: string;
      crypto_desc: string;
      analyze_btn: string;
      analyze_loading: string;
      rec_signal: string;
      confidence: string;
      strategy: string;
      ai_support: string;
      ai_resistance: string;
      saved_success: string;
    };
    general: {
      confidence: string;
      sr_grid_header: string;
      support_label: string;
      support_tip: string;
      resistance_label: string;
      resistance_tip: string;
    };
  };
};

export const translations: Record<'th', TranslationKeys> = {
  th: {
    common: {
      crypto: 'คริปโต',
      forex: 'คู่เงิน',
      thai_stocks: 'หุ้นไทย',
      foreign_stocks: 'หุ้นต่างประเทศ',
      indices: 'ดัชนี',
      live: 'LIVE',
      backup: 'สำรอง',
      loading_auth: 'กำลังตรวจสอบสิทธิ์การเข้าใช้งาน...',
      close_window: 'ปิดหน้าต่าง',
      save: 'บันทึก',
      success: 'สำเร็จ',
      error: 'เกิดข้อผิดพลาด',
    },
    auth: {
      welcome_title: 'MOTORBOY AI-TH',
      welcome_desc: 'AI auto API Trading - เร็ว แม่น ปลอดภัย แบบ MotorBoy | Hybrid Pro Co-Pilot สำหรับนักเทรดมืออาชีพ',
      login_error_popup_closed: 'หน้าต่างเข้าสู่ระบบถูกปิดโดยผู้ใช้ กรุณาลองใหม่อีกครั้ง',
      login_error_generic: 'เกิดข้อผิดพลาดในการเข้าใช้งาน',
      sign_in_google: 'เริ่มใช้งาน',
    },
    trading: {
      price_alert_toast: '🔔 แจ้งเตือนราคา: {symbol} ถึงเป้าหมายที่ {price} แล้ว! (ปัจจุบัน: {current})',
      graph_live: 'กราฟแสดงข้อมูลแบบเรียลไทม์',
      graph_backup: 'ตลาดปิดหรือออฟไลน์ • ใช้ราคาสำรอง',
      update_at: 'อัปเดตเมื่อ: {time}',
      backup_price_info: 'ใช้ราคาสำรอง (ยังไม่ได้ดึงข้อมูล Live)',
    },
    settings: {
      title: 'การตั้งค่าและคีย์ API',
      google_account: 'โหมดบันทึกข้อมูล',
      synced: 'เก็บในเครื่อง',
      google_search_info: 'Search Grounding: เปิดใช้งานค้นหาข้อมูลตลาดสด',
      live_grounding: 'Live Grounding',
      api_section_title: 'การจัดการรหัส API (API Key Management)',
      api_section_desc: 'ระบุรหัส API เพื่อเปิดใช้งานการวิเคราะห์สัญญาณตลาดแบบเรียลไทม์ (ข้อมูลจะถูกเก็บไว้ในเครื่องของคุณเท่านั้น)',
      api_section_status_exists: 'บันทึกคีย์ไว้ในเครื่องเรียบร้อยแล้ว (คลิกเพื่อแก้ไข)',
      api_section_status_missing: 'ยังไม่มีการระบุรหัส API (คลิกเพื่อตั้งค่า)',
      api_label: 'รหัส API (Gemini API Key - เก็บในเครื่อง)',
      api_info: 'รับ API Key ได้ที่ AI Studio',
      api_get_key: 'รับ API Key ได้ที่ AI Studio',
      api_save_btn: 'บันทึกคีย์ในเครื่อง',
      api_test_btn: 'ทดสอบการเชื่อมต่อ',
      api_saving: 'กำลังบันทึก...',
      api_testing: 'กำลังทดสอบ...',
      api_save_success: 'บันทึก API Key ไว้ในเครื่องสำเร็จเรียบร้อย',
      api_test_required: 'กรุณาระบุ API Key ก่อนเริ่มการทดสอบการเชื่อมต่อ',
      currency_label: 'สกุลเงินแสดงผล',
      currency_thb: 'บาทไทย (฿ THB)',
      currency_usd: 'ดอลลาร์สหรัฐ ($ USD)',
      notif_label: 'การแจ้งเตือนสัญญาณ',
      notif_on: 'เปิดใช้งานและส่งการแจ้งเตือน',
      notif_off: 'ปิดการแจ้งเตือนอยู่',
      notif_btn_on: 'เปิดใช้งานอยู่ ✓',
      notif_btn_off: 'เปิดการแจ้งเตือน',
      alert_title: 'ตั้งเป้าหมายแจ้งเตือนราคา (Price Alert - ในเครื่อง)',
      alert_coin_label: 'เหรียญ',
      alert_price_label: 'ราคาเป้าหมาย ($ USD)',
      alert_save_btn: 'บันทึกการแจ้งเตือนราคา',
      alert_saved_success: 'บันทึกการแจ้งเตือน {symbol} ที่ {price} สำเร็จ!',
      alert_list_header: 'รายการแจ้งเตือนที่ตั้งไว้:',
      alert_target: 'เป้าหมาย:',
      sync_footer: 'ข้อมูลทั้งหมดบันทึกไว้ในเครื่อง (localStorage)',
    },
    risk_calc: {
      title: 'คำนวณความเสี่ยง',
      labels: {
        signal_picker: 'ดึงข้อมูลจาก MotorBoy Signal',
        manual_entry: '— พิมพ์แผนเทรดเอง —',
        direction: 'ทิศทาง (LONG/SHORT)',
        account_size: 'ขนาดบัญชี ({currency})',
        risk_per_trade: 'ความเสี่ยงต่อไม้ (%) — กฎเหล็ก: ห้ามเกิน 2%',
        entry_price: 'จุดเข้าเทรด (Entry Price) ($)',
        sl_price: 'จุดตัดขาดทุน (Stop Loss) ($)',
        rr_ratio: 'เป้าหมายกำไร (RR Ratio) — ขั้นต่ำ 1:1.5',
        leverage: 'เลเวอเรจ (Leverage x)',
      },
      checklist: {
        header: 'MotorBoy Risk Guard (เช็กระบบป้องกัน)',
        risk_limit_title: 'ความเสี่ยงอยู่ในเกณฑ์ปลอดภัย (≤ 2%)',
        risk_limit_ok: 'ยอดเยี่ยม! หัวใจสำคัญคือการคุมความเสี่ยงเพื่อให้อยู่ในตลาดได้ระยะยาว',
        risk_limit_fail: '⚠️ ผิดกฎ Risk Guard! ห้ามเสี่ยงเกิน 2% ต่อไม้ โปรดลดขนาด Position หรือขยับ SL',
        consistent_long_title: 'SL อยู่ใต้ Entry (ฝั่ง LONG)',
        consistent_short_title: 'SL อยู่เหนือ Entry (ฝั่ง SHORT)',
        consistent_ok: 'วางตำแหน่ง SL ถูกต้องตามทิศทางแล้ว',
        consistent_fail: 'ตำแหน่ง SL ผิดฝั่ง! โปรดเช็กราคา Entry และ SL ให้ดีก่อนเข้า',
        sl_dist_title: 'ระยะ SL {dist}% (ระยะปลอดภัย)',
        sl_dist_ok: 'ระยะนี้พอเหมาะสำหรับการหลบ Noise ราคาตามโครงสร้างตลาด',
        sl_dist_fail: 'SL ชิดราคาเกินไป! เสี่ยงโดนสะบัดกินทุนง่าย ควรขยับให้พ้น Swing High/Low',
        rr_title: 'RR Ratio 1:{rr} (เป้าหมายกำไร)',
        rr_ok: 'คุ้มค่า! สัดส่วนกำไรสูงกว่าความเสี่ยงตามมาตรฐาน MotorBoy',
        rr_fail: 'กำไรไม่คุ้มความเสี่ยง! ควรได้ RR อย่างน้อย 1:1.5 เพื่อความได้เปรียบทางสถิติ',
        lev_spot_title: 'เทรดแบบ Spot (ไร้ Leverage)',
        lev_margin_title: 'ใช้ Leverage x{lev}',
        lev_spot_tip: 'ปลอดภัยที่สุด ไม่เสี่ยงต่อการถูกล้างพอร์ต (No Liquidation)',
        lev_margin_tip: 'วางเงินหลักประกัน {margin} — โปรดจำไว้ว่าเลเวอเรจคือดาบสองคม!',
      },
      results: {
        notional: 'มูลค่าสัญญา (Position Notional)',
        units: 'จำนวนหน่วย (Units)',
        risk: 'จำนวนเงินที่เสี่ยง',
        reward: 'เป้าหมายกำไร (Target Reward)',
        margin: 'เงินหลักประกัน (Required Margin)',
        summary: 'สรุป: เปิดไม้ {notional} หากผิดทางจะเสีย {risk} ({riskPct}% ของพอร์ต) หากถูกทางจะได้ {reward} — เสี่ยง 1 ได้ {rr} เท่า',
        invalid_input: 'กรุณากรอกข้อมูลให้ครบถ้วน: บัญชี > 0, เสี่ยง 0–100%, Entry/SL > 0 และไม่เท่ากัน, Leverage ≥ 1',
      },
      ai: {
        header: 'MotorBoy Real-time Plan Review',
        desc: 'น้องมอเตอร์บอยจะวิเคราะห์โครงสร้างตลาด โมเมนตัม และแผน SL/TP ของคุณ พร้อมเทคนิคคุมความเสี่ยงเฉพาะหน้า',
        analyze_btn: 'ส่งแผนให้ MotorBoy ตรวจสอบ',
        analyze_loading: 'กำลังบิดไปเช็กข้อมูลตลาดสดให้...',
        reanalyze_btn: 'ตรวจสอบแผนใหม่อีกครั้ง',
        api_missing: 'ยังไม่ได้ใส่ Gemini API Key — โปรดตั้งค่าใน Settings เพื่อการวิเคราะห์ที่แม่นยำที่สุด',
        error: 'บิดไปเช็กไม่สำเร็จ! กรุณาลองใหม่อีกครั้งครับ',
      },
      save: {
        success: 'ล็อคความเสี่ยงและบันทึกแผนเรียบร้อย! 🏍️ Full Throttle!',
        error: 'บันทึกลงประวัติไม่สำเร็จ กรุณาลองใหม่อีกครั้ง',
        btn: 'ล็อคความเสี่ยงและบันทึกแผน',
      },
    },
    signal_detail: {
      tabs: {
        ai: 'AI Analysis',
        tech: 'เทคนิคอล',
        risk: 'SL / TP',
        similarity: 'ความแม่นยำ',
      },
      sentiment: {
        header: 'คะแนนความเชื่อมั่นตลาด (Market Sentiment)',
        whale_acc: 'สะสมซื้อ',
        whale_dist: 'ระบายขาย',
        whale_neutral: 'ทรงตัว',
        social_high: 'คึกคักสูง',
        social_low: 'ซบเซา',
        social_mid: 'ปานกลาง',
        loading: 'กำลังดึงคะแนน Market Sentiment จาก Gemini API...',
      },
      ai_analysis: {
        forex_header: 'Forex Macro & Live AI Intelligence',
        crypto_header: 'AI Market Intelligence Live Analysis',
        forex_desc: 'วิเคราะห์คู่เงิน อัตราดอกเบี้ยธนาคารกลาง ดัชนีเงินเฟ้อ CPI/GDP และระดับแนวรับแนวต้านด้วย AI Engine',
        crypto_desc: 'ประมวลผลข้อมูลราคาเรียลไทม์ ค้นหาข้อมูลตลาดสด และวิเคราะห์ด้วย AI Engine พร้อมบันทึกประวัติในเครื่องอัตโนมัติ',
        analyze_btn: 'วิเคราะห์ด้วย AI และบันทึกลงประวัติ',
        analyze_loading: 'กำลังประมวลผลด้วย AI Engine...',
        rec_signal: 'สัญญาณแนะนำ: {action}',
        confidence: 'ความมั่นใจ {conf}%',
        strategy: 'กลยุทธ์ที่แนะนำ:',
        ai_support: 'แนวรับ AI (Support)',
        ai_resistance: 'แนวต้าน AI (Resistance)',
        saved_success: 'บันทึกการวิเคราะห์ลงในประวัติเรียบร้อยแล้ว',
      },
      general: {
        confidence: '% มั่นใจ',
        sr_grid_header: 'กรอบราคาแนวรับ - แนวต้าน (Support & Resistance)',
        support_label: 'แนวรับ (Support)',
        support_tip: 'จุดพิจารณาตั้ง SL / รองรับแรงซื้อ',
        resistance_label: 'แนวต้าน (Resistance)',
        resistance_tip: 'จุดพิจารณาแบ่งทำกำไร (TP)',
      },
    },
  },
};

export function t(keyPath: string, params?: Record<string, string>): string {
  const keys = keyPath.split('.');
  let current: any = translations.th;

  for (const key of keys) {
    current = current?.[key];
  }

  if (typeof current !== 'string') {
    return keyPath;
  }

  if (params) {
    Object.entries(params).forEach(([k, v]) => {
      current = current.replace(`{${k}}`, v);
    });
  }

  return current;
}
