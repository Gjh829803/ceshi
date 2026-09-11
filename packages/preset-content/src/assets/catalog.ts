import { SPECS, type VehicleSpec } from '../config';

/** Catalog identity is independent of the local vehicle instance ID. */
export function assetIdForPreset(spec: Pick<VehicleSpec, 'id' | 'mode'>, flyingCreatureVariantId?: string): string {
  return flyingCreatureVariantId ? `creature.dragon.${flyingCreatureVariantId.toLowerCase()}`
    : spec.mode === 'dragon' ? 'creature.dragon-evolved'
    : `${spec.mode === 'mount' ? 'creature' : 'vehicle'}.${spec.id}`;
}

export type AssetEntry = {
  id: string;
  name: string;
  en: string;
  mode: string;
  kernel: string;
  color: string;
  icon: string;
  environment: 'ground' | 'water' | 'air';
  tags: readonly string[];
  kind?: 'character' | 'vehicle' | 'creature';
  /** Authored asset version, or `local` when no release version is recorded. */
  version?: string;
  contributor?: string;
  source?: string;
  status?: 'local' | 'draft';
  summary?: string;
  /** Real image of this asset. Omit when only a model is available. */
  thumbnail?: string;
};

export function filterAssets(assets: readonly AssetEntry[], query: string, environment: string): AssetEntry[] {
  const terms = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  return assets.filter(asset => {
    if (environment === 'character' && asset.kind !== 'character') return false;
    if (environment === 'creatures' && asset.kind !== 'creature') return false;
    if (!['all', 'character', 'creatures'].includes(environment) && asset.environment !== environment) return false;
    const searchText = [asset.id, asset.name, asset.en, asset.mode, asset.kernel, asset.environment,
      asset.kind, asset.version, asset.contributor, asset.source, asset.status, asset.summary,
      ...asset.tags].join(' ').toLocaleLowerCase();
    return terms.every(term => searchText.includes(term));
  });
}

/** Favorites are an unlimited collection; the six-slot limit only applies to shortcuts. */
export function sanitizeAssetIds(assets: readonly AssetEntry[], value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const validIds = new Set(assets.map(asset => asset.id));
  return [...new Set(value.filter((id): id is string => typeof id === 'string' && validIds.has(id)))];
}

export type AssetSort = 'catalog' | 'name' | 'recent';

export function sortAssets(assets: readonly AssetEntry[], order: AssetSort, recentIds: readonly string[] = []): AssetEntry[] {
  const result = [...assets];
  if (order === 'name') return result.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));
  if (order === 'recent') {
    const rank = new Map(sanitizeAssetIds(assets, recentIds).map((id, index) => [id, index]));
    return result.sort((a, b) => (rank.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (rank.get(b.id) ?? Number.MAX_SAFE_INTEGER));
  }
  return result;
}

export function resolveQuickSlots(assets: readonly AssetEntry[], ids: readonly string[], limit = 6): AssetEntry[] {
  if (!Number.isFinite(limit) || limit <= 0) return [];
  const count = Math.min(6, Math.floor(limit));
  const byId = new Map(assets.map(asset => [asset.id, asset]));
  const slots: AssetEntry[] = [];
  const seen = new Set<string>();
  for (const id of ids) {
    if (slots.length >= count) break;
    const asset = byId.get(id);
    if (!asset || seen.has(id)) continue;
    seen.add(id);
    slots.push(asset);
  }
  return slots;
}

const metadata: Record<VehicleSpec['mode'], Pick<AssetEntry, 'environment' | 'icon' | 'tags'>> = {
  paddled_boat: {environment:'water',icon:'boat',tags:['划桨','水面','浮力','单人']},
  wheeled: { environment: 'ground', icon: 'car', tags: ['四轮', '陆地', '漂移'] },
  tank: {environment:'ground',icon:'car',tags:['坦克','履带','差速','原地转向','封闭驾驶舱','炮塔','炮管']},
  bus: { environment: 'ground', icon: 'car', tags: ['巴士','小巴','客车','四轮','陆地','驾驶室','缓起步','长轴距','低速倒车'] },
  motorcycle: { environment: 'ground', icon: 'bike', tags: ['摩托车', '两轮', '陆地', '倾斜转向'] },
  unicycle: { environment: 'ground', icon: 'bike', tags: ['独轮车', '单轮', '陆地', '平衡', '踩踏', '单脚撑地'] },
  skateboard: { environment: 'ground', icon: 'skateboard', tags: ['贴面滑行', '陆地', '站姿'] },
  ski: { environment: 'ground', icon: 'skateboard', tags: ['雪橇', '滑雪', '双板', '雪杖', '站姿', '无动力', '顺坡滑行', '压刃转弯'] },
  sled: { environment: 'ground', icon: 'skateboard', tags: ['雪橇', '雪地', '双滑条', '坐姿', '无动力', '重力下坡', '蹬地', '拖脚制动'] },
  hover: { environment: 'ground', icon: 'box', tags: ['悬浮', '陆地', '侧移'] },
  boat: { environment: 'water', icon: 'sailboat', tags: ['水面', '水域', '船舵'] },
  submarine: { environment: 'water', icon: 'ship', tags: ['水下', '水域', '下潜', '横滚'] },
  glider: { environment: 'air', icon: 'plane', tags: ['固定翼', '空域', '无动力', '滑翔'] },
  plane: { environment: 'air', icon: 'plane', tags: ['固定翼', '空域', '动力飞行'] },
  spacecraft: { environment: 'air', icon: 'rocket', tags: ['无重力', '空域', '六自由度', '6DOF'] },
  mount: { environment: 'ground', icon: 'rabbit', tags: ['动物', '生物', '坐骑', '马', '步态', '骑乘'] },
  carriage: { environment: 'ground', icon: 'car', tags: ['动物', '生物', '马车', '牵引', '关节', '拖挂'] },
  dragon: { environment: 'air', icon: 'bird', tags: ['动物', '生物', '飞龙', '翅膀', '飞行', '骑乘'] },
};

export function buildAssetCatalog(specs: readonly VehicleSpec[] = SPECS): AssetEntry[] {
  return specs.map(({ id, name, en, mode, archetype, kernel, color, flyingCreature }) => ({
    id, name, en, mode, kernel, color,
    ...metadata[mode],...(archetype==='kayak'?{tags:[...metadata.paddled_boat.tags,'皮划艇','双头桨']}:{}),...(archetype==='raft'?{tags:['橡皮艇','充气艇','PUBG','划桨','陆地滑行','回弹','缓冲']}:{}),...(id==='observation-submarine'?{tags:['潜艇','观景','单人','球舱','水下','浮力','压载','推进器']}:{}),...(id==='jetski'?{tags:['水上摩托','喷射','水花','尾流','跨坐','加速']}:{}),...(archetype==='canoe'?{tags:['木舟','独木舟','单桨','单叶桨','水面','浮力','惯性','单人']}:{}),...(id==='atv'?{tags:['ATV','Quad','PUBG','全地形车','四轮','越野','跨坐','车把','手刹']}:{}),
    kind: ['mount', 'carriage', 'dragon'].includes(mode) ? 'creature' : 'vehicle',
    version: 'local',
    contributor: '工作区内置',
    source: flyingCreature ? 'Century / 编号飞龙'
      : mode === 'mount' ? 'Quaternius / Ultimate Animated Animals'
      : mode === 'dragon' ? 'Quaternius / Ultimate Monsters'
        : mode === 'carriage' ? 'Quaternius 马匹 / 本地车厢' : 'Three.js 程序模型',
    status: 'local',
  }));
}

/** Workspace registry: the preserved character and every configured vehicle. */
export function buildWorkspaceCatalog(specs: readonly VehicleSpec[] = SPECS): AssetEntry[] {
  return [{
    id: 'person', name: '主体人物', en: 'CHARACTER', mode: 'character', kernel: '101 BONES',
    color: '#bdd3ad', icon: 'person-standing', environment: 'ground', kind: 'character',
    tags: ['人物', '步行', '穿越', '攀爬', '游泳', '48 个动画片段', '101 骨骼'],
    version: 'local', contributor: '工作区导入', source: 'traversal-lab 原人物场', status: 'local',
    summary: 'UEFN 人形 · Source101 骨架 · 48 个动画片段',
  }, ...buildAssetCatalog(specs)];
}
