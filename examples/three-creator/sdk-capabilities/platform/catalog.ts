import { SPECS, type VehicleSpec } from '../config';

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
  wheeled: { environment: 'ground', icon: 'car', tags: ['四轮', '陆地', '漂移'] },
  bike: { environment: 'ground', icon: 'bike', tags: ['两轮', '陆地', '倾斜转向'] },
  slide: { environment: 'ground', icon: 'skateboard', tags: ['贴面滑行', '陆地', '站姿'] },
  hover: { environment: 'ground', icon: 'box', tags: ['悬浮', '陆地', '侧移'] },
  boat: { environment: 'water', icon: 'sailboat', tags: ['水面', '水域', '船舵'] },
  sub: { environment: 'water', icon: 'ship', tags: ['水下', '水域', '下潜', '横滚'] },
  glider: { environment: 'air', icon: 'plane', tags: ['固定翼', '空域', '无动力', '滑翔'] },
  plane: { environment: 'air', icon: 'plane', tags: ['固定翼', '空域', '动力飞行'] },
  space: { environment: 'air', icon: 'rocket', tags: ['无重力', '空域', '六自由度', '6DOF'] },
  mount: { environment: 'ground', icon: 'rabbit', tags: ['动物', '生物', '坐骑', '马', '步态', '骑乘'] },
  carriage: { environment: 'ground', icon: 'car', tags: ['动物', '生物', '马车', '牵引', '关节', '拖挂'] },
  dragon: { environment: 'air', icon: 'bird', tags: ['动物', '生物', '飞龙', '翅膀', '飞行', '骑乘'] },
};

export function buildAssetCatalog(specs: readonly VehicleSpec[] = SPECS): AssetEntry[] {
  return specs.map(({ id, name, en, mode, kernel, color }) => ({
    id, name, en, mode, kernel, color,
    ...metadata[mode],
    kind: ['mount', 'carriage', 'dragon'].includes(mode) ? 'creature' : 'vehicle',
    version: 'local',
    contributor: '工作区内置',
    source: mode === 'mount' ? 'Quaternius / Ultimate Animated Animals'
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
    tags: ['人物', '步行', '穿越', '攀爬', '游泳', '48 个动作', '101 骨骼'],
    version: 'local', contributor: '工作区导入', source: 'traversal-lab 原人物场', status: 'local',
    summary: '原模型 · 101 骨骼 · 48 个动作',
  }, ...buildAssetCatalog(specs)];
}
