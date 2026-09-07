/** Stable local IDs; each file retains its source and conversion metadata. */
export const BASE_CHARACTER_ASSET_IDS = ['idle-loop', 'walk-loop', 'run-loop', 'hurdle-1m', 'mantle-1m', 'climb-2m5'] as const;
export const MOVEMENT_ASSET_IDS = [
  'crouch-idle', 'crouch-walk', 'jump-stand', 'jump-run', 'fall-loop',
  'land-light', 'land-heavy', 'land-run-light', 'land-run-heavy',
  'run-start', 'run-stop', 'turn-left', 'turn-right', 'turn-back-left', 'turn-back-right',
] as const;
export const CHARACTER_ASSET_IDS = [...BASE_CHARACTER_ASSET_IDS, ...MOVEMENT_ASSET_IDS] as const;
export const SWIMMING_ASSET_IDS = ['swim-idle', 'swim-forward','swim-freestyle'] as const;

export const ACTION_NAMES: Record<string, string> = { 'idle-loop': 'idle', 'walk-loop': 'walk', 'run-loop': 'run' };
export const ANIMATION_LABELS: Record<string, string> = {
  idle: 'GASP · 站立', walk: 'GASP · 行走', run: 'GASP · 跑步',
  'hurdle-1m': 'GASP · 翻栏', 'mantle-1m': 'GASP · 上台', 'climb-2m5': 'GASP · 攀墙',
  'crouch-idle': 'GASP · 蹲姿待机', 'crouch-walk': 'GASP · 蹲走',
  'jump-stand': 'GASP · 原地起跳', 'jump-run': 'GASP · 跑动起跳', 'fall-loop': 'GASP · 下落',
  'land-light': 'GASP · 轻落地', 'land-heavy': 'GASP · 重落地',
  'land-run-light': 'GASP · 落地继续跑', 'land-run-heavy': 'GASP · 重落地继续跑',
  'run-start': 'GASP · 起步', 'run-stop': 'GASP · 停步',
  'turn-left': 'GASP · 左转身', 'turn-right': 'GASP · 右转身',
  'turn-back-left': 'GASP · 左转 180°', 'turn-back-right': 'GASP · 右转 180°',
  'swim-idle': 'UAL · 浮游待机', 'swim-forward': 'UAL · 前向游泳',
  'swim-freestyle':'CMU · 自由泳',
  roll:'UAL · 翻滚','slide-start':'UAL · 滑铲进入','slide-loop':'UAL · 滑铲','slide-exit':'UAL · 滑铲退出',
  'carry-walk':'UAL · 搬运行走',pickup:'UAL · 台面拾取','sit-enter':'UAL · 坐下','sit-idle':'UAL · 坐姿','sit-exit':'UAL · 起身',
  'hang-enter':'UAL · 攀墙进入','hang-exit':'UAL · 攀墙退出','hang-idle':'UAL · 壁面待机',
  'hang-left':'UAL · 壁面左移','hang-right':'UAL · 壁面右移','climb-up':'UAL · 向上攀爬','climb-down':'UAL · 向下攀爬','climb-ledge':'UAL · 越过墙沿',
  'prone-enter':'UAL · 趴下','prone-exit':'UAL · 匍匐起身','prone-idle':'UAL · 匍匐待机','prone-forward':'UAL · 匍匐前进',
  'prone-backward':'UAL · 匍匐后退','prone-left':'UAL · 匍匐左移','prone-right':'UAL · 匍匐右移',
};
