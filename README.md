# VRM 律动舞室 (Dancing Flow)

实时跟随音乐频谱与节拍律动的 3D VRM 虚拟角色舞蹈舞台应用，支持 **7 大舞种实时程序化编舞（28 个 4 小节乐句招式）**、**开源 BVH/VRMA 动捕动作库**、**多角色热切换（兼容 VRM 0.x / 1.0）** 与 **音乐频谱动态聚光灯主题**。

## 核心特性

- **多音源实时律动驱动**：内置 Web Audio 节拍合成器曲目、本地音频文件上传与麦克风实时采集，提取 24 频段频谱与低/中/高频能量并同步检测 BPM 与拍点。
- **7 大实时编舞风格 × 4 小节乐句演进（28 招式）**：
  - `自动编舞`：依据音乐 BPM 与频谱特征按 16 拍自动切换风格
  - `街舞 Hip-Hop`、`流行 Idol Pop`、`Urban / K-Pop 编舞`、`机械舞 Popping`、`轻快 House`、`拉丁 Salsa 律动`、`优雅华尔兹 (3/4 拍)`
  - 涵盖 20 块全身骨骼运动链滞后（脊柱 / 胸廓 / 上胸 / 头部 / 手腕拖尾）、风格专属律动包络及防穿模关节限位
- **开源动捕动作库与本地导入**：内置 5 套完整开源 BVH 舞蹈动捕并实时重定向至 VRM 骨骼，同时支持导入本地 `.bvh` / `.vrma` 动作文件。
- **5 款官方开源/免费 VRM 角色切换**：支持运行中热切换（兼容 VRM 0.x 与 VRM 1.0），亦可上传本地 `.vrm` 模型。
- **舞台灯光与视觉主题**：内置频谱柱状墙、双侧动态聚光灯与 6 套可切换舞台配色主题（含随频谱能量自动变色模式）。

## 本地运行

```bash
npm install
npm run dev
```

访问 `http://localhost:3000`。

### 构建与测试

```bash
npm run lint
npm run build
npx tsx --test src/**/*.test.ts
```

## 内置开源资源致谢

### VRM 角色模型（`public/models/`）
- `VRM1_Constraint_Twist_Sample.vrm` — pixiv Inc.（VRM Public License 1.0）
- `Seed-san.vrm` — VirtualCast, Inc.（VRM Public License 1.0）
- `AvatarSample_A.vrm` / `AvatarSample_B.vrm` — VRoid Studio（VRoid Sample License）
- `AliciaSolid_vrm-0.51.vrm` — DWANGO Co., Ltd.（Alicia Solid License）

### BVH 舞蹈动捕（`public/animations/`）
- `maniac.bvh` / `loveshot.bvh` / `gento.bvh` — `tulay-hub/dance-dataset`（MIT）
- `salsa.bvh` / `ballet.bvh` — CMU Graphics Lab Motion Capture Database（Public Mocap）
