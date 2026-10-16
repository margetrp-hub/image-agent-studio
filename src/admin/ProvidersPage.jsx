import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Pencil, Plus, RefreshCw, Trash2, X } from 'lucide-react';
import { Button, Dialog, DialogContent, DialogDescription, DialogTitle, IconButton, Notice, Switch } from '../ui/index.js';
import ProviderEditor, { PLATFORM_PROVIDER_TYPES } from './ProviderEditor.jsx';
import ModelPricingEditor from './ModelPricingEditor.jsx';
import { useUnsavedProviderChanges } from './useUnsavedProviderChanges.js';
import './platformProviders.css';

export function ProvidersPage({ client, onError }) {
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;
  const [providers, setProviders] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [revision, setRevision] = useState(0);
  const [dirty, setDirty] = useState(false);
  const confirmDiscard = useUnsavedProviderChanges(dirty);
  const selected = providers.find((provider) => provider.id === selectedId);
  const load = useCallback(async () => {
    if (!confirmDiscard()) return;
    setLoading(true);
    setError('');
    try {
      const items = await client.listAdminProviders();
      setProviders(items);
      setSelectedId((current) => items.some((item) => item.id === current) ? current : items[0]?.id || '');
      setRevision((value) => value + 1);
      setDirty(false);
    } catch (cause) {
      setError('无法读取供应商，请重试。');
      onErrorRef.current?.('无法读取供应商，请重试。');
    } finally {
      setLoading(false);
    }
  }, [client, confirmDiscard]);
  useEffect(() => { load(); }, [load]);
  function discardThen(action) {
    if (!confirmDiscard()) return;
    setDirty(false);
    setRevision((value) => value + 1);
    action();
  }
  async function mutate(action, success) {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const result = await action();
      if (result?.id) {
        setProviders((current) => current.some((item) => item.id === result.id) ? current.map((item) => item.id === result.id ? result : item) : [...current, result]);
        setSelectedId(result.id);
        setRevision((value) => value + 1);
      }
      setMessage(success);
      return result;
    } catch (cause) {
      setError('操作未完成，请检查供应商连接、模型价格和积分配置。');
      onError?.('供应商操作未完成，请检查连接、价格和积分配置。');
      throw cause;
    } finally {
      setBusy(false);
    }
  }
  return <section className="iasAdminSection iasPlatformProviders" aria-label="供应商与定价">
    <div className="iasPlatformProviderHeading">
      <h2>平台连接</h2>
      <div className="iasPlatformProviderActions">
        <IconButton title="刷新供应商" aria-label="刷新供应商" disabled={loading || busy} onClick={load}><RefreshCw size={16} /></IconButton>
        <Button variant="primary" disabled={busy} onClick={() => discardThen(() => setEditing({}))}><Plus size={16} />新增供应商</Button>
      </div>
    </div>
    {error ? <Notice tone="danger">{error}</Notice> : null}
    {message ? <Notice tone="success">{message}</Notice> : null}
    {dirty ? <Notice tone="warning">有未保存的定价修改</Notice> : null}
    {loading ? <p role="status">正在加载供应商...</p> : <>
      <div className="iasPlatformTableWrap"><table className="iasPlatformTable">
        <thead><tr><th>供应商</th><th>协议</th><th>接口地址</th><th>状态</th><th>启用</th><th>操作</th></tr></thead>
        <tbody>{providers.map((provider) => <tr key={provider.id} data-selected={provider.id === selectedId}>
          <td><button className="iasPlatformProviderName" type="button" disabled={busy} onClick={() => { if (selectedId !== provider.id) discardThen(() => setSelectedId(provider.id)); }}>{provider.name}</button><small>{provider.models?.filter((model) => model.enabled).length || 0} 个已发布模型</small></td>
          <td>{PLATFORM_PROVIDER_TYPES.find(([id]) => id === provider.providerId)?.[1] || provider.providerId}</td>
          <td className="iasPlatformEndpoint">{provider.baseUrl}</td>
          <td>{!provider.hasApiKey ? '未配置密钥' : provider.enabled ? '已启用' : '已停用'}</td>
          <td><Switch aria-label={`启用 ${provider.name}`} checked={provider.enabled === true} disabled={busy || (!provider.hasApiKey && !provider.enabled)} onCheckedChange={(enabled) => discardThen(() => { mutate(() => client.saveAdminProvider(provider.id, { enabled }), enabled ? '供应商已启用。' : '供应商已停用。').catch(() => {}); })} /></td>
          <td><div className="iasPlatformProviderActions">
            <IconButton title="同步模型" aria-label={`同步 ${provider.name} 模型`} disabled={busy || !provider.hasApiKey} onClick={() => discardThen(() => { mutate(() => client.syncAdminProviderModels(provider.id), '模型已同步。').catch(() => {}); })}><RefreshCw size={15} /></IconButton>
            <IconButton title="编辑供应商" aria-label={`编辑 ${provider.name}`} disabled={busy} onClick={() => discardThen(() => setEditing(provider))}><Pencil size={15} /></IconButton>
            <IconButton title="删除供应商" aria-label={`删除 ${provider.name}`} tone="danger" disabled={busy} onClick={() => discardThen(() => setDeleting(provider))}><Trash2 size={15} /></IconButton>
          </div></td>
        </tr>)}</tbody>
      </table></div>
      {!providers.length ? <p className="iasPlatformMuted">暂无内置供应商。</p> : null}
      {selected ? <ModelPricingEditor key={`${selected.id}:${revision}`} provider={selected} busy={busy} onDirtyChange={setDirty} onSave={(models) => mutate(() => client.saveAdminProvider(selected.id, { models }), '模型定价已保存。')} /> : null}
    </>}
    {editing ? <ProviderEditor provider={editing.id ? editing : null} onClose={() => setEditing(null)} onSave={(draft) => {
      const connectionChanged = editing.id && (draft.baseUrl !== editing.baseUrl || draft.providerId !== editing.providerId || Boolean(draft.apiKey));
      return mutate(() => client.saveAdminProvider(editing.id, { ...draft, ...(connectionChanged ? { enabled: false } : {}) }), connectionChanged ? '连接已更新，供应商已停用，待重新同步模型。' : '供应商已保存。');
    }} /> : null}
    <Dialog open={Boolean(deleting)} onOpenChange={(open) => { if (!open && !busy) setDeleting(null); }}>
      <DialogContent className="iasDialog iasPlatformProviderDialog">
        <div className="iasPlatformProviderHeading"><DialogTitle>删除供应商</DialogTitle><IconButton title="关闭" aria-label="关闭" disabled={busy} onClick={() => setDeleting(null)}><X size={18} /></IconButton></div>
        <DialogDescription>删除“{deleting?.name}”后，该供应商的模型将不可用。</DialogDescription>
        {error ? <Notice tone="danger">{error}</Notice> : null}
        <div className="iasPlatformProviderActions"><Button disabled={busy} onClick={() => setDeleting(null)}>取消</Button><Button variant="danger" disabled={busy} onClick={async () => {
          try {
            await mutate(() => client.deleteAdminProvider(deleting.id), '供应商已删除。');
            setDeleting(null);
            await load();
          } catch { /* The error notice remains visible. */ }
        }}><Trash2 size={15} />删除</Button></div>
      </DialogContent>
    </Dialog>
  </section>;
}

export default ProvidersPage;
