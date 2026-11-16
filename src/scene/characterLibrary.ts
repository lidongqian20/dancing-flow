export interface VRMCharacterPreset {
  id: string;
  label: string;
  shortLabel: string;
  subtitle: string;
  url: string;
  author: string;
  license: string;
  vrmVersion: 'VRM 1.0' | 'VRM 0.x';
  accentHex: string;
}

export const DEFAULT_CHARACTER_ID = 'twist-sample';

export const BUILTIN_VRM_CHARACTERS: VRMCharacterPreset[] = [
  {
    id: 'twist-sample',
    label: '小夏 · 休闲舞者',
    shortLabel: '小夏',
    subtitle: '白T恤短裤与长发物理 · 轻快街头风格',
    url: '/models/VRM1_Constraint_Twist_Sample.vrm',
    author: 'pixiv Inc.',
    license: 'VRM Public License 1.0',
    vrmVersion: 'VRM 1.0',
    accentHex: '#f59e0b',
  },
  {
    id: 'seed-san',
    label: 'Seed-san · 机械臂少年',
    shortLabel: 'Seed-san',
    subtitle: '黑发白蓝装束与背挂机械臂 · VirtualCast 官方看板角色',
    url: '/models/Seed-san.vrm',
    author: 'VirtualCast, Inc.',
    license: 'VRM Public License 1.0',
    vrmVersion: 'VRM 1.0',
    accentHex: '#38bdf8',
  },
  {
    id: 'avatar-a',
    label: '遥 · 针织甜酷少女',
    shortLabel: '针织少女 A',
    subtitle: '棕发浅米针织开衫与黑丝造型 · VRoid Studio 官方示例',
    url: '/models/AvatarSample_A.vrm',
    author: 'VRoid Studio',
    license: 'VRoid Sample (免费商用)',
    vrmVersion: 'VRM 0.x',
    accentHex: '#f472b6',
  },
  {
    id: 'avatar-b',
    label: '凛音 · 街头潮舞少女',
    shortLabel: '潮舞少女 B',
    subtitle: '紫青挑染长发与棒球服百褶裙 · VRoid Studio 官方示例',
    url: '/models/AvatarSample_B.vrm',
    author: 'VRoid Studio',
    license: 'VRoid Sample (免费商用)',
    vrmVersion: 'VRM 0.x',
    accentHex: '#34d399',
  },
  {
    id: 'alicia-solid',
    label: 'Alicia Solid · 金发歌姬',
    shortLabel: 'Alicia',
    subtitle: '金发双马尾与蓝白舞台连衣裙 · 经典免费 VRM 偶像',
    url: '/models/AliciaSolid_vrm-0.51.vrm',
    author: 'DWANGO Co., Ltd.',
    license: 'Alicia Solid License (免费使用)',
    vrmVersion: 'VRM 0.x',
    accentHex: '#a78bfa',
  },
];

export function getCharacterById(id: string): VRMCharacterPreset {
  return (
    BUILTIN_VRM_CHARACTERS.find((item) => item.id === id) ??
    BUILTIN_VRM_CHARACTERS[0]
  );
}
