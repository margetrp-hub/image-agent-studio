import React, { useState } from 'react';
import { ChevronLeft, ChevronRight, Save, Search } from 'lucide-react';
import { Button, Input, Notice, Switch } from '../ui/index.js';

const OPERATIONS = [['image', '生图', 'textToImage'], ['edit', '编辑', 'imageEdit'], ['video', '视频', 'videoGeneration']];

export function modelConfiguration(models) {
  return models.map((model) => ({
    id: model.id,
    name: model.name,
    enabled: model.enabled === true,
    prices: Object.fromEntries(OPERATIONS.map(([key]) => {
      const value = model.prices?.[key];
      const price = value === '' || value == null ? null : Number(value);
      if (price !== null && (!Number.isSafeInteger(price) || price < 0 || price > 10000000)) throw new Error('INVALID_MODEL_PRICE');
      return [key, price];
    }))
  }));
}

export default function ModelPricingEditor({ provider, busy, onSave, onDirtyChange }) {
  const [models, setModels] = useState(() => provider.models || []);
  const [query, setQuery] = useState('');
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState('');
  const [page, setPage] = useState(0);
  const filtered = models.filter((item) => `${item.id} ${item.name || ''}`.toLowerCase().includes(query.toLowerCase()));
  const visible = filtered.slice(page * 50, (page + 1) * 50);
  function update(id, patch) {
    setModels((current) => current.map((item) => item.id === id ? { ...item, ...patch } : item));
    setDirty(true);
    onDirtyChange(true);
    setError('');
  }
  async function save(event) {
    event.preventDefault();
    try {
      const config = modelConfiguration(models);
      if (config.some((model) => model.enabled && !Object.values(model.prices).some((value) => value !== null))) {
        setError('发布模型需要至少配置一项可用操作的价格。');
        return;
      }
      await onSave(config);
      setDirty(false);
      onDirtyChange(false);
    } catch (cause) {
      setError(cause?.message === 'INVALID_MODEL_PRICE' ? '单价必须是 0 到 10000000 的整数。' : '定价未保存，请检查连接后重试。');
    }
  }
  return <form className="iasPlatformModels" onSubmit={save}>
    <div className="iasPlatformProviderHeading">
      <h3>{provider.name} / 模型定价</h3>
      <Button type="submit" variant="primary" disabled={busy || !dirty}><Save size={15} />{busy ? '保存中...' : '保存定价'}</Button>
    </div>
    <div className="iasPlatformModelSearch"><Search size={16} /><Input aria-label="搜索模型" placeholder="搜索模型" value={query} onChange={(event) => { setQuery(event.target.value); setPage(0); }} /></div>
    {error ? <Notice tone="danger">{error}</Notice> : null}
    <div className="iasPlatformTableWrap"><table className="iasPlatformTable">
      <thead><tr><th>模型</th><th>调用状态</th>{OPERATIONS.map(([key, label]) => <th key={key}>{label}积分 / {key === 'video' ? '任务' : '张'}</th>)}<th>发布</th></tr></thead>
      <tbody>{visible.map((model) => {
        const supported = model.supported === true && model.available === true;
        return <tr key={model.id}>
          <td><strong>{model.name || model.id}</strong>{model.name && model.name !== model.id ? <small>{model.id}</small> : null}</td>
          <td>{!model.available ? '已失效 / 未发现' : !model.supported ? '暂不支持调用' : '可调用'}</td>
          {OPERATIONS.map(([key, label, capability]) => <td key={key}>{model.capabilities?.[capability] && model.supported ? <Input type="number" min="0" max="10000000" step="1" inputMode="numeric" aria-label={`${model.id} ${label}积分`} placeholder="未定价" value={model.prices?.[key] ?? ''} disabled={busy || !model.available} onChange={(event) => update(model.id, { prices: { ...model.prices, [key]: event.target.value } })} /> : <span className="iasPlatformMuted">不支持</span>}</td>)}
          <td><Switch aria-label={`发布 ${model.id}`} checked={model.enabled === true} disabled={busy || (!supported && !model.enabled)} onCheckedChange={(enabled) => update(model.id, { enabled })} /></td>
        </tr>;
      })}</tbody>
    </table></div>
    {!visible.length ? <p className="iasPlatformMuted">{models.length ? '没有匹配的模型。' : '尚未发现模型。'}</p> : null}
    {filtered.length > 50 ? <div className="iasPlatformProviderActions">
      <Button aria-label="上一页模型" disabled={page === 0} onClick={() => setPage((value) => value - 1)}><ChevronLeft size={16} /></Button>
      <span>{page + 1} / {Math.ceil(filtered.length / 50)} · {filtered.length} 个模型</span>
      <Button aria-label="下一页模型" disabled={(page + 1) * 50 >= filtered.length} onClick={() => setPage((value) => value + 1)}><ChevronRight size={16} /></Button>
    </div> : null}
  </form>;
}
