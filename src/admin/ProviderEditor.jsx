import React, { useState } from 'react';
import { Save, X } from 'lucide-react';
import { Button, Dialog, DialogContent, DialogDescription, DialogTitle, IconButton, Input, Notice } from '../ui/index.js';
import { useUnsavedProviderChanges } from './useUnsavedProviderChanges.js';

export const PLATFORM_PROVIDER_TYPES = [
  ['openai-compatible', 'OpenAI Compatible'],
  ['newapi-compatible', 'New API'],
  ['sub2api-compatible', 'Sub2API'],
  ['gemini-compatible', 'Gemini'],
  ['xai-compatible', 'xAI'],
  ['video-compatible', 'Video Compatible']
];

export default function ProviderEditor({ provider, onSave, onClose }) {
  const [draft, setDraft] = useState({ name: provider?.name || '', providerId: provider?.providerId || 'openai-compatible', baseUrl: provider?.baseUrl || '', apiKey: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const dirty = draft.name !== (provider?.name || '') || draft.providerId !== (provider?.providerId || 'openai-compatible') || draft.baseUrl !== (provider?.baseUrl || '') || Boolean(draft.apiKey);
  const confirmDiscard = useUnsavedProviderChanges(dirty);
  const close = () => { if (!busy && confirmDiscard()) onClose(); };
  const update = (key) => (event) => setDraft((current) => ({ ...current, [key]: event.target.value }));
  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await onSave({ name: draft.name.trim(), providerId: draft.providerId, baseUrl: draft.baseUrl.trim(), ...(draft.apiKey.trim() ? { apiKey: draft.apiKey.trim() } : {}) });
      onClose();
    } catch {
      setError('供应商未保存，请检查配置后重试。');
    } finally {
      setBusy(false);
    }
  }
  return <Dialog open onOpenChange={(open) => { if (!open) close(); }}>
    <DialogContent className="iasDialog iasPlatformProviderDialog">
      <div className="iasPlatformProviderHeading">
        <DialogTitle>{provider ? '编辑供应商' : '新增供应商'}</DialogTitle>
        <IconButton title="关闭" aria-label="关闭" disabled={busy} onClick={close}><X size={18} /></IconButton>
      </div>
      <DialogDescription>{provider ? '密钥留空保留当前值。' : '保存后为停用草稿。'}</DialogDescription>
      {dirty ? <span role="status">有未保存的修改</span> : null}
      <form onSubmit={submit} className="iasPlatformProviderForm">
        <label>名称<Input required maxLength={120} value={draft.name} onChange={update('name')} disabled={busy} /></label>
        <label>协议<select value={draft.providerId} onChange={update('providerId')} disabled={busy}>{PLATFORM_PROVIDER_TYPES.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>
        <label>接口地址<Input required type="url" placeholder="https://api.example.com/v1" value={draft.baseUrl} onChange={update('baseUrl')} disabled={busy} /></label>
        <label>API Key<Input type="password" autoComplete="new-password" required={!provider?.hasApiKey} value={draft.apiKey} onChange={update('apiKey')} disabled={busy} placeholder={provider?.hasApiKey ? '已配置，留空保留' : '输入密钥'} /></label>
        {error ? <Notice tone="danger">{error}</Notice> : null}
        <div className="iasPlatformProviderActions"><Button disabled={busy} onClick={close}>取消</Button><Button type="submit" variant="primary" disabled={busy}><Save size={15} />{busy ? '保存中...' : '保存'}</Button></div>
      </form>
    </DialogContent>
  </Dialog>;
}
