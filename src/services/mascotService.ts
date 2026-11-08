import { create } from 'zustand';

export type MascotState = 
  | 'IDLE' 
  | 'SCANNING' 
  | 'CONFIRM_TRADE' 
  | 'READY_TO_EXECUTE' 
  | 'TP_CELEBRATE' 
  | 'SL_RESPECTED' 
  | 'RISK_REJECT' 
  | 'KILL_SWITCH_ACTIVE' 
  | 'SIDEWAYS' 
  | 'ONBOARDING';

interface MascotStore {
  state: MascotState;
  message: string;
  setMascotState: (state: MascotState, message?: string) => void;
  resetToIdle: () => void;
}

export const useMascotStore = create<MascotStore>((set) => ({
  state: 'IDLE',
  message: 'สวัสดีครับ ผมมอเตอร์บอย พร้อมเป็น Co-Pilot ให้คุณแล้ว!',
  setMascotState: (state: MascotState, message?: string) => set({ 
    state, 
    message: message || getDefaultMessage(state) 
  }),
  resetToIdle: () => set({ 
    state: 'IDLE', 
    message: getDefaultMessage('IDLE') 
  }),
}));

function getDefaultMessage(state: MascotState): string {
  switch (state) {
    case 'SCANNING': return 'กำลังบิดไปเช็กข้อมูลตลาดสดให้ครับ...';
    case 'CONFIRM_TRADE': return 'เจอจังหวะน่าสนใจแล้ว ยืนยันแผนเทรดนี้ไหมครับ?';
    case 'READY_TO_EXECUTE': return 'Full Throttle! พร้อมลุยตามแผนแล้วครับ';
    case 'TP_CELEBRATE': return 'เรียบร้อย! Take Profit ตามเป้า วินัยดีเยี่ยมครับ';
    case 'SL_RESPECTED': return 'เจ็บแต่จบครับ SL ครั้งนี้เพื่อรักษาทุนก้อนใหญ่ไว้';
    case 'RISK_REJECT': return 'เบรกก่อนจิ! ความเสี่ยงเกิน 2% ผมไม่แนะนำให้เข้าไม้นี้นะ';
    case 'KILL_SWITCH_ACTIVE': return '🛑 อันตราย! Drawdown หนักเกินไป ผมขอสั่งหยุดเทรดชั่วคราวครับ';
    case 'SIDEWAYS': return 'ตลาดนิ่งเกินไป พักสายตาไปหาอะไรดื่มก่อนไหมครับ?';
    case 'ONBOARDING': return 'ยินดีต้อนรับสู่ MotorBoy AI-TH มาเริ่มตั้งค่าพอร์ตกันครับ';
    default: return 'สวัสดีครับ ผมมอเตอร์บอย พร้อมเป็น Co-Pilot ให้คุณแล้ว!';
  }
}
