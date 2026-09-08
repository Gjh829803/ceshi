const API = '/creator-evals/api/reviews';
const STORAGE = 'worldkit-shared-review-drafts-v1';
const id = () => [...crypto.getRandomValues(new Uint8Array(16))].map(n => n.toString(16).padStart(2, '0')).join('');
const fields = record => Object.fromEntries(['verdict', 'fidelity', 'playability', 'bugs', 'notes'].map(k => [k, record?.[k] || '']));
export const reviewKey = (runId, caseId, build, reviewerId = '') => [runId, caseId, build, reviewerId].join('|');
export function reviewSummary(records) {
  const passed = records.filter(r => r.verdict === 'pass').length, failed = records.filter(r => r.verdict === 'fail').length;
  return { passed, failed, status: passed && failed ? 'mixed' : passed ? 'pass' : failed ? 'fail' : 'unreviewed', label: passed && failed ? '有分歧' : passed ? '通过' : failed ? '不通过' : '待评价' };
}

export class SharedReviews {
  constructor(onchange) {
    this.onchange = onchange; this.records = []; this.reviewer = null; this.context = null;
    this.connected = false; this.saving = new Set(); this.polling = false;
    try { this.drafts = JSON.parse(localStorage.getItem(STORAGE) || '{}'); } catch { this.drafts = {}; }
    if (!this.drafts || typeof this.drafts !== 'object' || Array.isArray(this.drafts)) this.drafts = {};
    this.timer = setInterval(() => { void this.poll(); this.flushAll(); }, 5000);
    window.addEventListener('online', () => { void this.poll(); this.flushAll(); });
    window.addEventListener('beforeunload', () => this.persist());
  }
  emit() { this.onchange(); }
  persist() {
    try { localStorage.setItem(STORAGE, JSON.stringify(this.drafts)); this.storageError = false; }
    catch { this.storageError = true; }
  }
  async request(path, options = {}) {
    const response = await fetch(API + path, { cache: 'no-store', credentials: 'same-origin', signal: AbortSignal.timeout(10000), ...options,
      headers: { 'Content-Type': 'application/json', 'X-WorldKit-Review': '1', ...(options.headers || {}) } });
    let value; try { value = await response.json(); } catch { value = {}; }
    if (!response.ok) throw Object.assign(new Error(value.error || '连接失败'), { status: response.status, ...value });
    return value;
  }
  configure(runId) {
    if (this.context?.runId === runId) return;
    this.context = { runId, galleryPath: location.pathname.endsWith('/') ? location.pathname : location.pathname.replace(/[^/]*$/, '') };
    this.records = []; void this.poll();
  }
  async poll() {
    if (!this.context || this.polling) return;
    this.polling = true; const context = this.context;
    const before = JSON.stringify([this.records, this.reviewer, this.connected]);
    try {
      const value = await this.request('?gallery=' + encodeURIComponent(context.galleryPath));
      if (this.context !== context) return;
      if (value.runId !== context.runId || !Array.isArray(value.reviews)) throw Error('轮次已变化');
      const merged = new Map();
      for (const row of [...this.records, ...value.reviews]) {
        if (row.runId !== context.runId) continue;
        const key = reviewKey(row.runId, row.caseId, row.worldBuildHash, row.reviewerId);
        if (!merged.has(key) || merged.get(key).revision < row.revision) merged.set(key, row);
      }
      this.records = [...merged.values()]; this.reviewer = value.reviewer; this.connected = true;
    } catch { if (this.context === context) this.connected = false; }
    finally { this.polling = false; if (before !== JSON.stringify([this.records, this.reviewer, this.connected])) this.emit(); }
  }
  async identify(displayName) {
    const value = await this.request('/session', { method: 'POST', body: JSON.stringify({ displayName }) });
    this.reviewer = value.reviewer; this.connected = true; this.emit(); void this.poll(); this.flushAll();
  }
  list(caseId, build) { return this.records.filter(r => r.runId === this.context?.runId && r.caseId === caseId && r.worldBuildHash === build); }
  key(caseId, build) { return reviewKey(this.context?.runId, caseId, build, this.reviewer?.id); }
  mine(caseId, build) {
    const draft = this.drafts[this.key(caseId, build)];
    return draft?.value || this.list(caseId, build).find(r => r.reviewerId === this.reviewer?.id) || fields();
  }
  state(caseId, build) {
    const key = this.key(caseId, build), draft = this.drafts[key];
    if (!this.reviewer) return '先填写标注人姓名';
    if (draft?.conflict) return '另一窗口已更新，请处理冲突';
    if (this.storageError && draft) return '本地暂存失败，请保持页面打开';
    if (draft?.error) return '待同步 · 草稿已暂存';
    if (draft || this.saving.has(key)) return '正在自动保存…';
    return this.list(caseId, build).some(r => r.reviewerId === this.reviewer?.id) ? '已保存到云端' : '选择后自动保存';
  }
  change(caseId, build, value) {
    if (!this.reviewer || !this.context || !/^[a-f0-9]{64}$/.test(build || '')) return;
    const key = this.key(caseId, build), old = this.drafts[key], saved = this.list(caseId, build).find(r => r.reviewerId === this.reviewer.id);
    this.drafts[key] = { ...old, ...this.context, caseId, worldBuildHash: build, reviewerId: this.reviewer.id,
      baseRevision: old?.baseRevision ?? saved?.revision ?? 0, mutationId: id(), value: fields(value), error: null };
    this.persist(); this.emit();
    clearTimeout(this.debounce); this.debounce = setTimeout(() => this.flushAll(), 450);
  }
  flushAll() { for (const key of Object.keys(this.drafts)) void this.flush(key); }
  async flush(key) {
    const draft = this.drafts[key];
    if (!draft || draft.reviewerId !== this.reviewer?.id || draft.conflict || this.saving.has(key)) return;
    this.saving.add(key);
    // Keep the exact uncertain mutation for retries, even if the user keeps typing.
    draft.attempt ||= { ...fields(draft.value), mutationId: draft.mutationId, baseRevision: draft.baseRevision };
    const attempt = draft.attempt; this.persist();
    try {
      const result = await this.request('?gallery=' + encodeURIComponent(draft.galleryPath), { method: 'PUT', body: JSON.stringify({
        runId: draft.runId, caseId: draft.caseId, worldBuildHash: draft.worldBuildHash, ...attempt,
      }) });
      const current = this.drafts[key];
      this.records = this.records.filter(r => reviewKey(r.runId, r.caseId, r.worldBuildHash, r.reviewerId) !== key).concat(result.review);
      if (current?.mutationId === attempt.mutationId) delete this.drafts[key];
      else if (current) { current.baseRevision = result.review.revision; delete current.attempt; current.error = null; }
      this.connected = true;
    } catch (error) {
      const current = this.drafts[key];
      if (current) {
        current.error = error.message;
        if (error.status === 409) current.conflict = { current: error.current || null, code: error.error };
      }
      if (!error.status || error.status >= 500) this.connected = false;
    } finally { this.saving.delete(key); this.persist(); this.emit(); }
    if (this.drafts[key] && !this.drafts[key].error && !this.drafts[key].conflict) void this.flush(key);
  }
  resolve(caseId, build, keepMine) {
    const key = this.key(caseId, build), draft = this.drafts[key];
    if (!draft?.conflict) return;
    const current = draft.conflict.current;
    if (!current) return;
    if (keepMine) {
      draft.baseRevision = current.revision; draft.mutationId = id();
      delete draft.attempt; delete draft.error; delete draft.conflict;
    } else {
      this.records = this.records.filter(r => reviewKey(r.runId, r.caseId, r.worldBuildHash, r.reviewerId) !== key).concat(current);
      delete this.drafts[key];
    }
    this.persist(); this.emit(); if (keepMine) void this.flush(key);
  }
}
