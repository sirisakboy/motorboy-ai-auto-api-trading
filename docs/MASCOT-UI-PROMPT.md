# พรอมต์สร้าง AI Mascot UI (ใช้ซ้ำกับโปรเจกต์อื่น)

ไฟล์นี้คือ "พรอมต์สำเร็จรูป" ที่กลั่นจากมาสคอตของโปรเจกต์นี้ (`src/components/MascotOverlay.tsx`)
ตัดเรื่อง logic/การวิเคราะห์/การตัดสินใจออกทั้งหมด — เหลือเฉพาะ **UI + การแสดงผล**

> 🇬🇧 English-only versions, split into copy-paste `.txt` files:
> [`docs/prompts/`](./prompts/) (`mascot-ui-prompt-A.txt`, `mascot-art-prompt-B.txt`, `mascot-ui-prompt-C-short.txt`)

> วิธีใช้: ก๊อปบล็อก **PROMPT A** ไปวางในแชทของ AI ที่จะสร้างโปรเจกต์ใหม่
> แล้วแทนที่ค่าที่อยู่ใน `{{ }}` (เช่น `{{MASCOT_NAME}}`, `{{BRAND}}`)
> ถ้าต้องการภาพตัวละครด้วย ใช้ **PROMPT B** แยกไปสั่งเครื่องมือสร้างภาพ

---

## PROMPT A — สร้างคอมโพเนนต์มาสคอต (UI only)

```text
สร้าง UI คอมโพเนนต์ "AI Mascot Overlay" สำหรับเว็บแอป {{PROJECT_NAME}} เป็น React + TypeScript + Tailwind
ชื่อตัวละคร: {{MASCOT_NAME}}

สำคัญ: ทำ "เฉพาะ UI/การแสดงผล" เท่านั้น
- ห้ามเขียน logic การวิเคราะห์ ตัดสินใจ business rule หรือเรียก API ใด ๆ
- รับสถานะมาทาง props/store ภายนอก (state, message, accent, isBusy) แล้วเรนเดอร์ตามสถานะ
- ห้ามแต่งตัวเลขหรือข้อความเทียมขึ้นมาเอง ให้แสดงค่าที่ได้รับเท่านั้น
- ต้องมี mock/demo component 1 ไฟล์ที่ป้อน state ปลอมได้ เพื่อดูทุกสถานะโดยไม่ต้องต่อ backend

โครงสร้างที่ต้องได้ (ไฟล์แยกชัดเจน):
1. MascotOverlay.tsx — ตัว overlay ที่ลอยอยู่มุมจอ
2. MascotBubble.tsx — กล่องข้อความ
3. mascot.types.ts — type ของ state/props
4. mascot.demo.tsx — หน้ารวมทุกสถานะไว้ดู
5. mascot.css (หรือ tailwind config) — token สี/จังหวะอนิเมชัน

=== ตำแหน่งและขนาด (ตามจริงของ design system นี้) ===
- overlay เป็น position: fixed, z-index 40, pointer-events: none ที่ตัว wrapper
  (ลูกที่กดได้ค่อยใส่ pointer-events: auto)
- ตำแหน่งเริ่มต้น: มุมขวาล่าง ระยะ 12px + env(safe-area-inset-bottom/right)
- ตัวละครสูง: 190px ตอนปกติ · 220px ตอนมีเหตุการณ์/กำลังพูด · 88px ตอนย่อ
- ตัวละครเป็น PNG โปร่งใส ไม่มีกรอบ ไม่มีการ์ดรองรับ ลอยเหนือพื้นหลัง
  ใส่ drop-shadow เบา ๆ: 0 10px 22px rgba(0,0,0,0.55)
- กล่องข้อความกว้าง 232px (จอ sm ขึ้นไป 264px), มุมโค้ง 20px, พื้นหลังโปร่งแสง + backdrop-blur,
  padding 12px, เงา 0 10px 30px rgba(0,0,0,0.45), มีหางชี้ (สี่เหลี่ยมจัตุรัส 10px หมุน 45°)
- วางกล่องไว้ "ด้านซ้าย" ของตัวละครเป็นค่าเริ่มต้น ถ้าผู้ใช้ลากมาสคอตไปฝั่งซ้ายของจอ
  (x < 320px) ให้สลับกล่องไปอีกฝั่งอัตโนมัติ (flex-row-reverse) เพื่อไม่ให้ล้นขอบจอ

=== สถานะที่ต้องรองรับ (แสดงผลอย่างเดียว) ===
- idle: ตัวละครลอยขึ้น-ลงเบา ๆ ไม่มีกล่องข้อความ
- talking / alert: เปิดกล่องข้อความ + สี accent เปลี่ยนตามระดับ (normal / warning / critical)
- busy: ปุ่มหรือไอคอนหมุน (spinner) แทนจุดสถานะ
- minimized: ย่อเหลือ 88px, กล่องข้อความพับ
- quiet: แทนมาสคอตด้วย "ชิปเล็ก" 1 ปุ่ม ขนาด ~auto, พื้นดำ 70% + blur, ตัวอักษร 10px
  ข้อความ "AI · เงียบ" กดเพื่อกลับมาโชว์มาสคอต
- hidden: ไม่เรนเดอร์อะไรเลย (return null)
- critical: ขอบกล่องข้อความเป็นสีเตือน + จุดสถานะกระพริบ (pulse)

=== องค์ประกอบในกล่องข้อความ (เรียงจากบนลงล่าง) ===
1. แถวหัว: ชื่อ {{MASCOT_NAME}} ตัวพิมพ์ใหญ่ 10px tracking-wide + ไอคอนเล็ก + ปุ่มย่อ (chevron)
2. ข้อความ 11px line-height relaxed สีข้อความหลัก ขึ้นบรรทัดใหม่ได้ ไม่ล้น
3. (ถ้ามี) การ์ดข้อมูลสั้น ๆ ในการ์ดย่อย: ขอบมน 12px, ตัวเลข font-mono 10px
4. ปุ่มหลัก 1 ปุ่ม เต็มความกว้าง สูง ~30px ตัวอักษร 10px ตัวหนา
5. ช่องพิมพ์ + ปุ่มส่ง: input พื้นยุบ ขอบมน 8px ตัวอักษร 10px, ปุ่มส่ง disabled เมื่อว่าง
6. แถวล่าง: ปุ่ม "ให้ AI พูด" (มี spinner ตอนโหลด) · ปุ่มเงียบ (ไอคอนลำโพงเปิด/ปิด) · ปุ่ม "ซ่อน"
   ทุกปุ่มตัวอักษร 10px ตัวหนา สีจาง ๆ (faint) และ hover เป็นสีข้อความหลัก

=== ปฏิสัมพันธ์ของตัวละคร ===
- ลากย้ายได้ด้วย pointer events (touch-action: none), cursor: grab / grabbing
- ลากแล้วต้องไม่ล้นจอ: clamp ตำแหน่งให้อยู่ใน viewport (เว้นระยะขอบ 8px)
- จำตำแหน่งไว้ใน localStorage และคืนค่าเมื่อโหลดใหม่
- คลิกตัวละคร = เปิด/ปิดกล่องข้อความ
- คีย์บอร์ด: Tab โฟกัสได้ (focus ring 2px + offset 2px), Enter/Space เปิดกล่อง,
  ลูกศรเลื่อนตำแหน่ง 16px (กด Shift = 48px)
- มี aria-label อธิบาย: "{{MASCOT_NAME}} — <สถานะ>. ลากเพื่อย้าย กดเพื่อเปิดกล่องข้อความ"
- กล่องข้อความใช้ role="status" aria-live="polite"

=== อนิเมชัน (ต้องเบา ไม่ดึงสายตา) ===
- ลอย: translateY 0 → -5px → 0 ระยะ 7 วินาที infinite, easing cubic-bezier(0.22, 0.8, 0.3, 1)
- เปิด/ปิดกล่อง: opacity + transition 300ms
- เปลี่ยนสี/สถานะ: 400ms ease
- หยุดอนิเมชันทั้งหมดเมื่อ prefers-reduced-motion: reduce
- ห้ามใช้ bounce/กระตุก/หมุนวนต่อเนื่อง

=== สี (token ที่ใช้ ไม่ต้องแก้เป็น hex กระจัดกระจาย) ===
พื้นหลังแอป #0F1117 · การ์ด #1C1F2E · พื้นยุบ #141725 · เส้นขอบ rgba(255,255,255,0.07)
ข้อความหลัก #ECEAF4 · รอง #A7A4B8 · จาง #8B88A0
แบรนด์/AI {{BRAND}} (#7C6CFF) · เน้นรอง #A89FFF · ข้อมูล #4CC9F0
บวก/สำเร็จ #7EE0B5 · เตือน #FFB86B · อันตราย #F4A6A6 (ห้ามใช้แดงล้วน)
มุมโค้ง: การ์ด 20px · ปุ่ม 14px · ชิป 999px · input 12px

=== กติกาที่ต้องยึด ===
- มีมาสคอตได้แค่ "ตัวเดียว" บนหน้าจอ (ถ้าพบตัวที่สองให้ console.warn)
- ห้ามบังเนื้อหาสำคัญ: ตัวละครต้องลากหนีได้ และมีปุ่มซ่อน
- สีไม่ใช่ตัวบอกความหมายเพียงอย่างเดียว ต้องมีข้อความ/ไอคอนกำกับด้วย
- ตัวอักษรขั้นต่ำ 10px และคอนทราสต์ข้อความหลัก ≥ 7:1
- รองรับจอมือถือ: กล่องข้อความไม่เกินความกว้างจอ (max-w-[calc(100vw-24px)])

ผลลัพธ์ที่ต้องการ: โค้ดพร้อมรัน + หน้า demo ที่สลับดูได้ทุกสถานะ (idle / talking / busy / minimized / quiet / hidden / critical)
และคำอธิบายสั้น ๆ ว่าแต่ละไฟล์ทำอะไร
```

---

## PROMPT B — สร้างภาพตัวละคร (image generation)

ใช้ได้กับ Midjourney / DALL·E / Imagen / Flux — ตัวละครสไตล์เดียวกับต้นฉบับของโปรเจกต์นี้

```text
Full-body 3D stylized character mascot, friendly young man, short spiky black hair,
light stubble, confident warm smile, arms crossed.
Outfit: black leather bomber jacket with dark-red zipper trim and a small red "M" logo
on the chest, black t-shirt, black cargo pants, black lace-up boots, black wristwatch.
Pixar-like soft shading, clean studio lighting, high detail on leather texture.
Transparent background (PNG alpha), centered, full body head to boots, front view,
neutral stance, no shadow under feet, no text, no watermark, no props.
Style reference: modern app mascot / 3D character key art, 4k.
```

**เวอร์ชันมีหลายอารมณ์ (สำหรับ sprite/pose set):**
```text
Same character, same outfit and lighting, 6 separate full-body renders on transparent background:
1) idle smiling with arms crossed
2) pointing forward (explaining)
3) thumbs up with a confident grin
4) thinking, hand on chin
5) surprised / warning expression, hands raised
6) tired, shoulders dropped
Consistent proportions and colors across all 6. Front view, no text, transparent PNG.
```

> หมายเหตุ: ถ้าเครื่องมือสร้างภาพไม่รองรับพื้นหลังโปร่งใส ให้สั่งพื้นหลังสีเดียวเรียบ
> (solid #00FF00 หรือ solid white) แล้วลบพื้นหลังออกเองภายหลัง — อย่าให้มีเงาตกพื้น

---

## PROMPT C — เวอร์ชันสั้น (วางในบรรทัดเดียวได้)

```text
ทำ AI mascot overlay (React + TS + Tailwind, UI เท่านั้น ไม่ต้องมี logic):
ตัวละคร PNG โปร่งใสลอยมุมขวาล่าง (สูง 190px, ขยาย 220px ตอนพูด, ย่อ 88px),
ลอยขึ้นลง 5px/7s, ลากย้ายได้ + จำตำแหน่ง + ลูกศรเลื่อน + focus ring + aria-label,
คลิกเปิดกล่องข้อความกว้าง 232/264px โปร่งแสง backdrop-blur มีหางชี้ สลับฝั่งอัตโนมัติเมื่อลากไปซ้าย,
ในกล่องมี ชื่อ+ไอคอน, ข้อความ 11px, ปุ่มหลัก, ช่องพิมพ์+ส่ง, ปุ่ม "ให้ AI พูด"/เงียบ/ซ่อน ขนาด 10px,
รองรับสถานะ idle/talking/busy/minimized/quiet(ชิปเล็ก)/hidden/critical(ขอบเตือน+จุดกระพริบ),
หยุดอนิเมชันเมื่อ prefers-reduced-motion, มีมาสคอตได้ตัวเดียวเท่านั้น
```

---

## ค่าอ้างอิงจากของจริง (เผื่ออยากได้ตรงเป๊ะ)

| สิ่ง | ค่า |
| --- | --- |
| ตำแหน่งเริ่มต้น | `right: 12px + safe-area` · `bottom: 12px + safe-area` |
| ความสูงตัวละคร | idle 190px · active 220px · minimized 88px |
| กล่องข้อความ | 232px (sm: 264px) · radius 20px · padding 12px · backdrop-blur |
| หางกล่อง | 10px หมุน 45° ชิดขอบล่าง |
| จุดสถานะบนตัวละคร | 16px วงกลม มุมขวาล่าง มี emoji 9px, `animate-pulse` เมื่อ critical |
| อนิเมชันลอย | `translateY(0 → -5px)` 7s infinite · ease `cubic-bezier(0.22,0.8,0.3,1)` |
| ตัวอักษร | หัวกล่อง 10px uppercase · ข้อความ 11px · การ์ดตัวเลข 10px mono · ปุ่ม 10px |
| ระยะห่างกริด | 8px (ใช้ 8/12/16/24/32) |
| สี accent | normal `#7C6CFF` · warning `#FFB86B` · critical `#F4A6A6` |
| ชิปโหมดเงียบ | พื้น `bg-black/70` + blur · ตัวอักษร 10px mono · radius 999px |

## Checklist ก่อนถือว่าเสร็จ
- [ ] มาสคอตตัวเดียวบนจอ ไม่ทับปุ่ม/เนื้อหาหลัก (ลากหนีได้ + ซ่อนได้)
- [ ] ทุกสถานะดูได้จากหน้า demo โดยไม่ต้องต่อ backend
- [ ] ใช้คีย์บอร์ดได้ครบ (โฟกัส/เปิด/ย้าย) และมี aria-label
- [ ] สีไม่ใช่ตัวบอกความหมายเดี่ยว ๆ (มีข้อความหรือไอคอนกำกับ)
- [ ] ปิดอนิเมชันเมื่อผู้ใช้ตั้ง reduce motion
- [ ] บนจอมือถือกล่องข้อความไม่ล้นจอ
- [ ] ไม่มี logic ธุรกิจ/API ฝังอยู่ในคอมโพเนนต์ UI
