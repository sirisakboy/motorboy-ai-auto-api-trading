# คู่มือการใช้งานชุดมาสคอต MotorBoy Studio AI-TH (Production & 3D Bible)

> **TAGLINE:** "AI auto API Trading - เร็ว แม่น ปลอดภัย แบบ MotorBoy"  
> **DISCLAIMER:** "นี่คือการวิเคราะห์และคู่มือการออกแบบเชิงระบบ ไม่ใช่คำแนะนำการลงทุน"

---

## 1. บทนำและแนวคิดการพัฒนา (Concept Evolution)
ชุดแพ็กเกจนี้จัดทำขึ้นเพื่อยกระดับมาสคอตของ **MotorBoy Studio AI-TH** จากเดิมที่เป็นภาพวาด 2D แนวช่างเครื่องการาจ ให้กลายเป็น **"3D Cyberpunk Pit-Crew Co-Pilot"** ระดับ Production-ready เพื่อนำไปใช้งานได้ทั้ง:
1. **ภาพนิ่ง (Stills / Marketing / App UI)** ผ่าน AI Image Generator ระดับสูง (Midjourney, Flux, SDXL)
2. **โมเดล 3D และงาน Rigging (Blender / Maya / Unreal Engine 5)** สำหรับสตรีมมิ่ง VTuber หรือโมเดลโต้ตอบบนเว็บ
3. **อนิเมชันภาพเคลื่อนไหว (Lottie / Video AI / Three.js)** สำหรับ Interactive Trading Dashboard

---

## 2. โครงสร้างโฟลเดอร์ในแพ็กเกจ (Folder Structure)

```text
MotorBoy_AI_TH_Mascot_FullPackage/
│
├── 01_Original_2D_Sprites/             <- ภาพต้นฉบับทั้ง 9 ท่า รีเนมตามสถานะระบบเทรดชัดเจน
│   ├── Pose_00_Engine_Scanning_Inspect.png
│   ├── Pose_01_Safety_Check_Shy.jpeg
│   ├── Pose_02_Risk_Guard_Reject_Pout.jpeg
│   ├── Pose_03_Onboarding_Chibi_Junior.png
│   ├── Pose_04_Kill_Switch_Market_Crash.jpeg
│   ├── Pose_05_Setup_Ready_Drill_Execute.jpeg
│   ├── Pose_06_Sideways_Market_Yawn.jpeg
│   ├── Pose_07_TP_Hit_Success_ThumbsUp.jpeg
│   ├── Pose_08_SL_Triggered_LossCut_Cry.jpeg
│   └── README_Sprite_Mapping.txt
│
├── 02_3D_Master_Prompts/               <- คลัง Prompt พร้อมคัดลอกไปเจน 3D ทุกรูปแบบ
│   ├── 01_Master_Character_Hero_Prompt.txt    (สร้างภาพ 3D Hero หน้าตรง/มุมเฉียง สวยคมระดับ 8k)
│   ├── 02_3D_Turnaround_ModelSheet_Prompt.txt(สร้าง Model Sheet 4 มุมมองเพื่อส่งต่อ 3D Modeler)
│   ├── 03_All_Emotions_3D_Render_Prompts.txt  (Prompt เจนทั้ง 9 อารมณ์ในเวอร์ชัน 3D)
│   ├── 04_Animation_Keyframe_Prompts_VideoAI.txt (Prompt สำหรับ Runway Gen-3 / Kling / Luma)
│   └── 05_ComfyUI_Workflow_Notes.txt          (เทคนิค ControlNet & LoRA Stack)
│
├── 03_Animation_and_Rigging_Specs/     <- มาตรฐานเทคนิคสำหรับ 3D Artist & Animator
│   ├── Character_Model_Specification.md       (สเปก Polycount, LODs, กระดูก และ ARKit 52)
│   ├── State_Engine_Animation_Graph.json      (State Machine ผูกอารมณ์เข้ากับ Logic พอร์ต)
│   └── VFX_Shader_Guide_Neon_Bloom.md         (สูตรค่าสี Shader นีออนเรืองแสง)
│
├── 04_Brand_and_System_Config/         <- ไฟล์ Config ตัวตนแบรนด์และระบบ AI Co-Pilot
│   ├── motorboy_system_profile.json           (JSON Profile ตาม System Spec)
│   ├── Color_Palette_and_Design_Tokens.css    (CSS Variables สีหลัก #FF2D55, #A855F7, #3B82F6)
│   └── Brand_Identity_and_Rules.md            (กฎเหล็ก Risk Guard และ Kill Switch)
│
├── 05_UI_Integration_Code_Examples/    <- โค้ดตัวอย่างนำไปต่อหน้าเว็บ Dashboard ได้ทันที
│   ├── TradingDashboardMascot.tsx             (React + Tailwind Component พร้อมใช้งาน)
│   ├── mascotStateController.js               (Class คำนวณตรรกะความเสี่ยงและเปลี่ยนท่าทาง)
│   └── dashboard_widget_demo.html             (เว็บตัวอย่างแบบ Interactive กดทดสอบได้ทันที)
│
└── MANUAL_คู่มือการใช้งาน_MotorBoy_Mascot.md   (เอกสารฉบับนี้)
```

---

## 3. ขั้นตอนการนำไปใช้งาน (Step-by-Step Workflow)

### ขั้นตอนที่ 1: การสร้างภาพ 3D เรนเดอร์ใหม่ (AI Image Generation)
1. เปิดไฟล์ `02_3D_Master_Prompts/01_Master_Character_Hero_Prompt.txt`
2. คัดลอก Prompt ไปวางใน **Midjourney v6** หรือ **Flux.1**
3. หากต้องการทำครบ 9 ท่าทาง ให้เปิดไฟล์ `03_All_Emotions_3D_Render_Prompts.txt` แล้วใส่รูปต้นแบบใน `01_Original_2D_Sprites` เป็น Image Reference (Image-to-Image หรือ ControlNet OpenPose)

### ขั้นตอนที่ 2: การส่งต่อปั้นโมเดล 3D และ Rigging
1. ส่งไฟล์ `02_3D_Turnaround_ModelSheet_Prompt.txt` ให้ AI สร้างภาพ 4 มุมมอง (Front, Side, Back, 3/4)
2. ส่งต่อให้ 3D Modeler พร้อมแนบไฟล์ `03_Animation_and_Rigging_Specs/Character_Model_Specification.md`
3. กำหนดให้โมเดลรองรับ **ARKit 52 Blendshapes** เพื่อให้สามารถใช้ iPhone หรือเว็บแคมแทร็กใบหน้าสำหรับ Live Stream ได้

### ขั้นตอนที่ 3: การเชื่อมต่อหน้าเว็บ Dashboard
1. สามารถดับเบิลคลิกไฟล์ `05_UI_Integration_Code_Examples/dashboard_widget_demo.html` เพื่อเปิดทดสอบหน้า Dashboard จำลองบน Browser ได้ทันที
2. สำหรับโปรเจกต์ React / Next.js สามารถนำไฟล์ `TradingDashboardMascot.tsx` ไปวางในโฟลเดอร์ Components แล้วผูกกับ State ของพอร์ตเทรด

---

## 4. กฎเหล็กประจำตัว MotorBoy AI-TH (Risk Guard Policy)
* **Risk Limit:** หากผู้ใช้ตั้งค่าเสี่ยงเกิน **2% ต่อไม้** มาสคอตจะเปลี่ยนเป็นท่า `Pose_02 (หน้าบึ้งกอดอก)` และปฏิเสธคำสั่งทันที
* **Kill Switch:** หาก Drawdown รวมของวันเกิน **5%** มาสคอตจะเปลี่ยนเป็นท่า `Pose_04 (เอามือกุมหัว)` ส่งเสียงแจ้งเตือน *"🛑 เบรกก่อนจิ!"* และตัดการส่งคำสั่ง API อัตโนมัติทันที

---
**MotorBoy Studio AI-TH**  
*เร็ว แม่น ปลอดภัย แบบ MotorBoy* 🏍️💨
