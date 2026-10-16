import React, { useState } from 'react';
import { Check, Copy, Plus, X } from 'lucide-react';
import { Button, Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle, IconButton, Input, Notice } from '../ui/index.js';
import { formatDate, formatNumber, getErrorMessage } from './adminShared.js';

function CreateCodeDialog({ state, onClose }) {
  const [form, setForm] = useState({ amount: '1000', code: '', expiresAt: '', note: '' });
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const change = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }));
  async function submit(event) {
    event.preventDefault(); setError('');
    try {
      const created = await state.mutate(() => state.client.createAdminCreditCode({ amount: Number(form.amount), code: form.code.trim() || undefined, expiresAt: form.expiresAt ? new Date(form.expiresAt).toISOString() : undefined, note: form.note.trim() }), '兑换码已创建。');
      if (created) setResult(created);
    } catch (err) { setError(getErrorMessage(err)); }
  }
  return <Dialog open onOpenChange={(open) => { if (!open && !state.saving) onClose(); }}><DialogContent className="iasDialog"><div className="iasDialogHeader"><DialogTitle>{result ? '兑换码已生成' : '创建兑换码'}</DialogTitle><DialogClose asChild><IconButton aria-label="关闭" disabled={state.saving}><X size={18} /></IconButton></DialogClose></div><DialogDescription className="iasDialogHint">兑换码仅显示一次，请在关闭前复制。</DialogDescription>
    {result ? <div className="iasNewCode"><Input aria-label="新兑换码" value={result.code} readOnly onFocus={(event) => event.target.select()} /><Button onClick={async () => { try { await navigator.clipboard.writeText(result.code); setCopied(true); } catch { setError('请选中兑换码后手动复制。'); } }}>{copied ? <Check size={15} /> : <Copy size={15} />}{copied ? '已复制' : '复制兑换码'}</Button>{error && <Notice tone="danger">{error}</Notice>}</div> : <form className="iasDialogForm" onSubmit={submit}>
      <label className="iasField"><span>积分数量</span><Input type="number" min="1" max="1000000000" step="1" required value={form.amount} onChange={change('amount')} /></label>
      <label className="iasField"><span>自定义兑换码</span><Input value={form.code} onChange={change('code')} placeholder="留空自动生成" maxLength={64} /></label>
      <label className="iasField"><span>有效期</span><Input type="datetime-local" value={form.expiresAt} onChange={change('expiresAt')} /></label>
      <label className="iasField"><span>备注</span><Input value={form.note} onChange={change('note')} maxLength={240} /></label>
      {error && <Notice tone="danger">{error}</Notice>}
      <div className="iasDialogActions"><Button type="submit" variant="primary" disabled={state.saving}>{state.saving ? '创建中...' : '创建兑换码'}</Button></div>
    </form>}
  </DialogContent></Dialog>;
}

export function CodesPage({ state }) {
  const [creating, setCreating] = useState(false);
  const [disable, setDisable] = useState(null);
  const [disableError, setDisableError] = useState('');
  return <section className="iasAdminSection">
    <div className="iasSectionHeader"><div><h2>兑换码</h2><p>最近 {state.data.codes.length} 条记录</p></div><Button variant="primary" onClick={() => setCreating(true)} disabled={state.saving}><Plus size={16} />创建兑换码</Button></div>
    {!state.settings.saved.creditsEnabled && <Notice tone="info">积分已关闭。兑换码可以创建，开启积分与充值后才能兑换。</Notice>}
    <div className="iasTableWrap"><table className="iasUserTable"><thead><tr><th>兑换码</th><th>积分</th><th>状态</th><th>有效期</th><th>备注</th><th>操作</th></tr></thead><tbody>{state.data.codes.map((code) => {
      const expired = code.expiresAt && Date.parse(code.expiresAt) < Date.now();
      return <tr key={code.id}><td><code>{code.codeMask}</code></td><td>{formatNumber(code.amount)}</td><td>{code.redeemed ? '已兑换' : !code.active ? '已停用' : expired ? '已过期' : '可用'}</td><td>{code.expiresAt ? formatDate(code.expiresAt) : '长期'}</td><td className="iasNoteCell">{code.note || '无'}</td><td>{code.active && !code.redeemed && !expired && <Button size="small" disabled={state.saving} onClick={() => { setDisableError(''); setDisable(code); }}>停用</Button>}</td></tr>;
    })}{!state.data.codes.length && <tr><td colSpan={6} className="iasEmptyCell">还没有兑换码。</td></tr>}</tbody></table></div>
    {creating && <CreateCodeDialog state={state} onClose={() => setCreating(false)} />}
    <Dialog open={Boolean(disable)} onOpenChange={(open) => { if (!open && !state.saving) setDisable(null); }}><DialogContent className="iasDialog"><DialogTitle>停用兑换码</DialogTitle><DialogDescription className="iasDialogHint">{disable?.codeMask} 停用后将不能兑换。</DialogDescription>{disableError && <Notice tone="danger">{disableError}</Notice>}<div className="iasDialogActions"><DialogClose asChild><Button disabled={state.saving}>取消</Button></DialogClose><Button variant="danger" disabled={state.saving} onClick={async () => { try { await state.mutate(() => state.client.disableAdminCreditCode(disable.id), '兑换码已停用。'); setDisable(null); } catch (error) { setDisableError(getErrorMessage(error)); } }}>确认停用</Button></div></DialogContent></Dialog>
  </section>;
}
