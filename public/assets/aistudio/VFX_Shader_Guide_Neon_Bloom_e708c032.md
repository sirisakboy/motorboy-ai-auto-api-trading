# MotorBoy AI-TH — Neon Bloom & Shader Guidelines

## 1. Brand Neon Color Palette (Hex & Linear Emissive Values)
- **Primary Neon Red:** `#FF2D55` (RGB: 1.0, 0.176, 0.333) -> Multiplier: 4.5x for Post-Process Bloom
- **Secondary Purple:** `#A855F7` (RGB: 0.658, 0.333, 0.968) -> Multiplier: 3.8x
- **Accent Cyber Blue:** `#3B82F6` (RGB: 0.231, 0.509, 0.964) -> Multiplier: 5.0x
- **Background Base:** `#0A0A0A` (Deep metallic circuit dark)

## 2. Dynamic Emissive Shader Logic (Material Instance Parameter)
In Unreal Engine Material Graph / Three.js ShaderMaterial:
- Parameter `StateGlowColor` (Vector4)
- Parameter `PulseSpeed` (Scalar, default: 1.2 Hz)
- Formula:
  `Final_Emissive = Emissive_Texture * StateGlowColor * (1.0 + sin(Time * PulseSpeed) * 0.25) * Intensity`

When **TP Hit**: `StateGlowColor` transitions to `#10B981` (Profit Emerald).
When **SL Hit / Kill Switch**: `StateGlowColor` flashes `#EF4444` (Hazard Red).
When **Normal / Co-Pilot Standby**: Gradient interpolating `#FF2D55` to `#3B82F6`.
