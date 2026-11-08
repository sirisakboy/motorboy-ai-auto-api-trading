# MotorBoy AI-TH — Character Model & Rigging Technical Specification

## 1. General Geometry Requirements
- **Target Target:** Unreal Engine 5.4 / Unity 6 / WebGL (Spline / Three.js)
- **Polycount Budget:**
  - LOD0 (Cinematic / Hero UI): 50,000 - 65,000 Triangles
  - LOD1 (In-Game / Real-time Web 3D): 20,000 - 25,000 Triangles
  - LOD2 (Mobile Dashboard Widget): 8,000 - 12,000 Triangles
- **Height:** 168 cm (Proportions: 1:7.2 stylized athletic anime)

## 2. Skeleton & Rigging Hierarchy
- **Standard:** Humanoid Rig (Compatible with Unreal Engine Mannequin / Mixamo / Control Rig)
- **Facial Rigging:** Full **ARKit 52 Blendshapes** support for VTuber tracking / Live streaming.
  - Required Blendshapes: `eyeBlinkLeft`, `eyeBlinkRight`, `jawOpen`, `mouthSmileLeft`, `mouthSmileRight`, `browDownLeft`, `browDownRight`, `cheekPuff` (for pout state).
- **Secondary Physics Bones (Spring Bones / Kawaii Physics / Chaos Cloth):**
  - Ponytail (5 chain bones)
  - Headband ribbons (3 bones)
  - Tool belt pouch straps & wrench attachments (2-3 bones per side)
  - Jacket lower hem (4 bones)

## 3. PBR Texture & Material Setup
- **Texture Resolution:** 4K (Hero), 2K (Web)
- **Texture Channels:**
  - `BaseColor` (sRGB)
  - `Normal` (DirectX / OpenGL normal map)
  - `Roughness / Metallic / AO` (Channel packed: R=AO, G=Roughness, B=Metallic)
  - `Emissive` (Linear HDR color for neon glow trims on jacket, AR visor, and belt badges)
  - `Subsurface Scattering Profile` (Applied to facial skin and ear cartilege)
