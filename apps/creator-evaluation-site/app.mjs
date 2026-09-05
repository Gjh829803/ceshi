const $ = (id) => document.getElementById(id);
let storageKey = 'worldkit-gpt6-five-case-review-20260905';
const labels = { ready: '可试玩', issues: '可试玩 · 有问题', running: '生成中', queued: '排队中', verifying: '验证中', failed: '未完成' };
const isPlayable = (c) => ['ready', 'issues'].includes(c.status);
let data, selectedId, activeTab = 'play';
let reviews = {};
try { reviews = JSON.parse(localStorage.getItem(storageKey) || '{}'); } catch {}
function el(tag, text, className) { const n = document.createElement(tag); if (text !== undefined) n.textContent = text; if (className) n.className = className; return n; }
function badge(status) { return el('span', labels[status] || status, `badge ${status === 'ready' ? '' : ['failed', 'issues'].includes(status) ? 'failed' : 'pending'}`); }
function sourceUrl(path) { const u = new URL(path, location.href); if (u.origin !== location.origin || !u.pathname.startsWith('/creator-evals/')) throw new Error('Invalid artifact URL'); return u.href; }
function picture(path, alt, className) { const img = el('img', undefined, className); img.src = sourceUrl(path); img.alt = alt; img.loading = 'lazy'; return img; }
function drawCards() {
  $('cases').replaceChildren(...data.cases.map(c => {
    const b = el('button', undefined, 'case-card'); b.type = 'button'; b.setAttribute('aria-current', String(c.id === selectedId));
    b.append(picture(c.reference, c.title)); const info = el('span', undefined, 'card-info'); info.append(el('strong', c.title), badge(c.status)); b.append(info); b.onclick = () => select(c.id); return b;
  }));
  $('ready-count').textContent = data.cases.filter(isPlayable).length;
  $('total-count').textContent = `/ ${data.cases.length} 个可试玩`;
  if (data.title) $('evaluation-title').textContent = data.title;
  if (data.description) $('evaluation-description').textContent = data.description;
  $('updated').textContent = '更新于 ' + new Date(data.updatedAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
}
function select(id) {
  const c = data.cases.find(c => c.id === id) || data.cases[0]; selectedId = c.id; history.replaceState(null, '', '#' + c.id); drawCards();
  $('detail').hidden = false; $('case-title').textContent = c.title; $('case-tags').textContent = c.tags.join(' · '); $('case-note').textContent = c.note;
  $('case-status').replaceWith(Object.assign(badge(c.status), { id: 'case-status' }));
  $('reference').src = sourceUrl(c.reference); $('reference-link').href = sourceUrl(c.reference); $('prompt').textContent = c.prompt;
  $('opening-state').textContent = isPlayable(c) ? '最终交付版本' : labels[c.status];
  $('opening-container').replaceChildren(c.opening ? picture(c.opening, c.title + '白模首帧') : el('span', '场景完成并通过验证后展示'));
  $('ready-content').hidden = !isPlayable(c); $('player').replaceChildren(); $('video').pause(); $('video').removeAttribute('src'); $('video').load();
  if (isPlayable(c)) {
    if (c.profile) $('play-controls').textContent = '点击「加载场景」后开始探索。WASD / 方向键移动 · Shift 跑步 · Space 跳跃 · 拖动转镜头 · 滚轮缩放 · R 重置。具体玩法以场景说明为准。';
    $('metrics').replaceChildren(...[[`${c.metrics.simulationSeconds} 秒`, c.metrics.timeDomain === 'wall-clock' ? '真实操作录制' : '连续探索记录'], [`${c.metrics.visitedTargets} / ${c.metrics.targetCount}`, '路线目标到达'], [`${Math.round(c.metrics.travelledMeters)} m`, '记录行进距离'], [c.metrics.generationMinutes ? `${c.metrics.generationMinutes} 分钟` : '—', '云端生成耗时']].map(([value, label]) => { const n = el('div', undefined, 'metric'); n.append(el('strong', value), el('span', label)); return n; }));
    const playUrl = sourceUrl(c.playable) + '?play=1'; $('open-play').href = playUrl;
    const launch = el('button', '▶  加载场景，开始试玩'); launch.type = 'button'; launch.onclick = () => { const frame = el('iframe'); frame.title = c.title + '交互白模'; frame.allow = 'fullscreen'; frame.src = playUrl; $('player').replaceChildren(frame); frame.onload = () => { frame.focus(); if (activeTab !== 'play') { try { frame.contentWindow.__WORLDKIT_CREATOR__?.stopLive(); } catch {} } }; };
    $('player').append(picture(c.opening, '', 'play-cover'), launch);
    $('video').src = sourceUrl(c.video); $('video').poster = sourceUrl(c.opening); $('video-note').textContent = `该录像以 ${c.metrics.captureFps} fps 采样，用于检查自动路线，不代表实际游玩的帧率。`;
    $('triviews').replaceChildren(...c.triviews.map(v => { const f = el('figure'); f.append(el('figcaption', v.name), picture(v.image, v.name + '正面、右侧、背面')); return f; }));
  }
  for (const name of ['fidelity', 'playability', 'bugs', 'notes']) $('review').elements[name].value = reviews[c.id]?.[name] || '';
  $('save-status').textContent = reviews[c.id] ? '已恢复此浏览器中的评测' : '仅保存在当前浏览器';
  switchTab(activeTab);
}
function switchTab(tab) { activeTab = tab; for (const t of ['play', 'video', 'views']) { $('tab-' + t).hidden = tab !== t; document.querySelector(`[data-tab="${t}"]`).setAttribute('aria-selected', String(t === tab)); } if (tab !== 'video') $('video').pause(); const frame = $('player').querySelector('iframe'); if (frame) { try { const api = frame.contentWindow.__WORLDKIT_CREATOR__; void (tab === 'play' ? api?.startLive() : api?.stopLive())?.catch(() => {}); } catch {} } }
for (const b of document.querySelectorAll('[data-tab]')) b.onclick = () => switchTab(b.dataset.tab);
$('review').oninput = () => { const c = data.cases.find(c => c.id === selectedId); reviews[selectedId] = { caseId: selectedId, title: c.title, sourceHash: c.sourceHash || null, updatedAt: new Date().toISOString(), ...Object.fromEntries(new FormData($('review'))) }; try { localStorage.setItem(storageKey, JSON.stringify(reviews)); $('save-status').textContent = '已自动保存到此浏览器'; } catch { $('save-status').textContent = '浏览器无法保存，请导出评测'; } };
$('export').onclick = () => { const a = el('a'); const url = URL.createObjectURL(new Blob([JSON.stringify({ schemaVersion: 1, evaluationId: data.id, exportedAt: new Date().toISOString(), reviews: Object.values(reviews) }, null, 2)], { type: 'application/json' })); a.href = url; a.download = 'worldkit-gpt6-reviews.json'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); };
async function refresh() { try { const res = await fetch('./results.json', { cache: 'no-store' }); if (!res.ok) throw new Error(String(res.status)); const next = await res.json(); const previousCase = data?.cases.find(c => c.id === selectedId); if (next.reviewStorageKey && next.reviewStorageKey !== storageKey) { storageKey = next.reviewStorageKey; try { reviews = JSON.parse(localStorage.getItem(storageKey) || '{}'); } catch { reviews = {}; } } data = next; $('load-error').hidden = true; if (!selectedId) select(decodeURIComponent(location.hash.slice(1)) || data.cases.find(c => c.status === 'ready')?.id); else if (JSON.stringify(previousCase) !== JSON.stringify(data.cases.find(c => c.id === selectedId))) select(selectedId); else drawCards(); } catch { $('load-error').textContent = '暂时无法更新结果，正在重试；已打开的场景仍可继续试玩。'; $('load-error').hidden = false; } }
await refresh(); setInterval(refresh, 30000);
