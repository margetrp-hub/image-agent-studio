import React, { useEffect, useState } from 'react';
import { Download, RefreshCw } from 'lucide-react';
import { Button, Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle, Notice } from '../ui/index.js';
import { formatDate, getErrorMessage } from './adminShared.js';
import { RuntimeSettings } from './SettingsPages.jsx';

const ACTIVE = ['queued', 'checking', 'upgrading'];
const LABELS = { idle: '等待操作', queued: '已提交', checking: '检查版本', current: '已是最新', upgrading: '更新中', success: '更新完成', failed: '更新失败', rollback: '已回滚' };

export function SystemPage({ state }) {
  const { client, data, setData } = state;
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState('');
  const update = data.update;
  const active = ACTIVE.includes(update.state);
  async function refresh() {
    setBusy(true); setError('');
    try { const next = await client.getAdminUpdateStatus(); setData((current) => ({ ...current, update: next })); }
    catch (err) { setError(getErrorMessage(err)); }
    finally { setBusy(false); }
  }
  useEffect(() => {
    if (!active) return;
    let disposed = false;
    let timer;
    const poll = async () => {
      try {
        const next = await client.getAdminUpdateStatus();
        if (disposed) return;
        setData((current) => ({ ...current, update: next })); setError('');
      } catch { if (!disposed) setError('暂时无法读取更新状态，正在重新连接。'); }
      if (!disposed) timer = window.setTimeout(poll, 4000);
    };
    timer = window.setTimeout(poll, 4000);
    return () => { disposed = true; window.clearTimeout(timer); };
  }, [active, client, setData]);
  return <>
    <RuntimeSettings system={data.system} />
    <section className="iasAdminSection iasUpdateSection"><div className="iasSectionHeader"><h2>系统更新</h2><span className="iasAdminBadge">{LABELS[update.state] || '未读取'}</span></div>
      <div className="iasReadoutGrid"><div><span>当前版本</span><strong>{update.currentVersion ? `v${update.currentVersion.replace(/^v/, '')}` : '未读取'}</strong></div><div><span>目标版本</span><strong>{update.targetVersion ? `v${update.targetVersion.replace(/^v/, '')}` : '未检查'}</strong></div></div>
      <p>{update.message || '尚未检查更新。'}</p><p className="iasFieldHint">最近状态：{formatDate(update.updatedAt)}</p>
      {error && <Notice tone="danger">{error}</Notice>}
      <div className="iasSectionFooter"><Button onClick={refresh} disabled={busy}><RefreshCw size={15} className={busy ? 'iasSpin' : ''} />刷新状态</Button><Button variant="primary" disabled={busy || active} onClick={() => setConfirm(true)}><Download size={15} />{active ? '更新处理中...' : '检查并更新'}</Button></div>
    </section>
    <Dialog open={confirm} onOpenChange={setConfirm}><DialogContent className="iasDialog"><DialogTitle>检查并更新系统</DialogTitle><DialogDescription className="iasDialogHint">将从 GitHub Release 检查新版本并执行更新，期间服务可能短暂中断。</DialogDescription><div className="iasDialogActions"><DialogClose asChild><Button>取消</Button></DialogClose><Button variant="primary" disabled={busy} onClick={async () => {
      setBusy(true); setError('');
      try { const next = await client.requestAdminUpdate(); setData((current) => ({ ...current, update: next })); }
      catch (err) { setError(getErrorMessage(err)); }
      finally { setBusy(false); setConfirm(false); }
    }}>确认更新</Button></div></DialogContent></Dialog>
  </>;
}
