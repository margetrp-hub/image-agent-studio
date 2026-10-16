import React, { useMemo, useState } from 'react';
import { Check, ChevronLeft, ChevronRight, Coins, Copy, KeyRound, Search, UserX, X } from 'lucide-react';
import { Button, Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle, IconButton, Input, Notice, Textarea } from '../ui/index.js';
import { formatDate, formatNumber, getErrorMessage } from './adminShared.js';

function UserActionDialog({ action, state, onClose }) {
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const [copied, setCopied] = useState(false);
  const { client, mutate, saving } = state;
  const { user, kind } = action;
  const title = kind === 'adjust' ? `调整 ${user.username} 的余额` : kind === 'reset' ? `${user.username} 的密码重置码` : `禁用 ${user.username}`;

  async function submit(event) {
    event.preventDefault(); setError('');
    try {
      if (kind === 'adjust') {
        if (!Number.isInteger(Number(amount)) || Number(amount) === 0 || !reason.trim()) { setError('请填写非零整数积分和调账原因。'); return; }
        await mutate(() => client.adjustAdminUserCredits(user.id, { amount: Number(amount), reason: reason.trim() }), '积分流水已写入。');
        onClose();
      } else if (kind === 'disable') {
        await mutate(() => client.disableAdminUser(user.id), '账号已禁用。'); onClose();
      } else {
        const reset = await mutate(() => client.createAdminPasswordReset(user.id), '密码重置码已生成。', { refreshData: false });
        if (reset) setResult(reset);
      }
    } catch (err) { setError(getErrorMessage(err)); }
  }

  return <Dialog open onOpenChange={(open) => { if (!open && !saving) onClose(); }}><DialogContent className="iasDialog">
    <div className="iasDialogHeader"><DialogTitle>{title}</DialogTitle><DialogClose asChild><IconButton aria-label="关闭" disabled={saving}><X size={18} /></IconButton></DialogClose></div>
    <DialogDescription className="iasDialogHint">{kind === 'adjust' ? `当前余额 ${formatNumber(user.credits?.balance)}，正数增加，负数扣减。` : kind === 'disable' ? '禁用后该用户的登录会话将立即失效。' : result ? '请将此码单独交给账号本人，在登录页的“忘记密码”中使用。' : '生成新码后，之前的重置码将失效。用户原密码保持有效，直到完成重置。'}</DialogDescription>
    {result ? <div className="iasResetTokenPanel">
      <label className="iasField"><span>一次性重置码</span><Input readOnly value={result.token} onFocus={(event) => event.target.select()} /></label>
      <p className="iasFieldHint">有效期至 {formatDate(result.expiresAt)}，关闭后不再显示。</p>
      <Button onClick={async () => { try { await navigator.clipboard.writeText(result.token); setCopied(true); } catch { setError('无法访问剪贴板，请选中重置码后复制。'); } }}>{copied ? <Check size={15} /> : <Copy size={15} />}{copied ? '已复制' : '复制重置码'}</Button>
      {error && <Notice tone="danger">{error}</Notice>}
    </div> : <form className="iasDialogForm" onSubmit={submit}>
      {kind === 'adjust' && <><label className="iasField"><span>变动数量</span><Input autoFocus required type="number" step="1" value={amount} onChange={(event) => setAmount(event.target.value)} /></label><label className="iasField"><span>原因</span><Textarea required value={reason} onChange={(event) => setReason(event.target.value)} maxLength={240} /></label></>}
      {error && <Notice tone="danger">{error}</Notice>}
      <div className="iasDialogActions"><DialogClose asChild><Button variant="quiet" disabled={saving}>取消</Button></DialogClose><Button variant={kind === 'disable' ? 'danger' : 'primary'} type="submit" disabled={saving}>{saving ? '处理中...' : kind === 'adjust' ? '确认调账' : kind === 'reset' ? '生成重置码' : '确认禁用'}</Button></div>
    </form>}
  </DialogContent></Dialog>;
}

export function UsersPage({ state }) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [page, setPage] = useState(0);
  const [action, setAction] = useState(null);
  const users = useMemo(() => state.data.users.filter((user) => {
    const matches = [user.username, user.email, user.role].some((value) => String(value || '').toLowerCase().includes(query.trim().toLowerCase()));
    return matches && (filter === 'all' || (filter === 'active' ? user.active : !user.active));
  }), [state.data.users, query, filter]);
  const currentPage = Math.min(page, Math.max(0, Math.ceil(users.length / 20) - 1));
  return <section className="iasAdminSection iasUsersSection">
    <div className="iasTableToolbar"><label className="iasSearchBox"><Search size={16} /><Input aria-label="搜索用户" value={query} onChange={(event) => { setQuery(event.target.value); setPage(0); }} placeholder="搜索邮箱或用户名" /></label><select className="iasSelect" aria-label="用户状态" value={filter} onChange={(event) => { setFilter(event.target.value); setPage(0); }}><option value="all">全部状态</option><option value="active">正常</option><option value="disabled">已禁用</option></select></div>
    <div className="iasTableWrap" tabIndex={0} role="region" aria-label="用户列表"><table className="iasUserTable"><thead><tr><th>用户</th><th>角色</th><th>状态</th><th>积分余额</th><th>注册时间</th><th>操作</th></tr></thead><tbody>
      {users.slice(currentPage * 20, (currentPage + 1) * 20).map((user) => <tr key={user.id}>
        <td><div className="iasUserCell"><span className="iasUserAvatar">{String(user.username || user.email || '?').slice(0, 1).toUpperCase()}</span><span><strong>{user.username}</strong><small>{user.email}</small></span></div></td>
        <td><span className="iasAdminBadge">{user.role === 'admin' ? '管理员' : '用户'}</span></td><td><span className={user.active ? 'iasStatusActive' : 'iasStatusDisabled'}>{user.active ? '正常' : '已禁用'}</span></td>
        <td><strong>{formatNumber(user.credits?.balance)}</strong><small className="iasTableSubtext">已用 {formatNumber(user.credits?.lifetimeSpent)}</small></td><td className="iasDateCell">{formatDate(user.createdAt)}</td>
        <td><div className="iasTableActions"><Button size="small" disabled={state.saving} onClick={() => setAction({ user, kind: 'adjust' })}><Coins size={14} />调账</Button>{user.active && <><IconButton title="生成密码重置码" aria-label="生成密码重置码" disabled={state.saving} onClick={() => setAction({ user, kind: 'reset' })}><KeyRound size={16} /></IconButton><IconButton tone="danger" title={state.user.id === user.id ? '不能禁用当前账号' : '禁用账号'} aria-label="禁用账号" disabled={state.saving || state.user.id === user.id} onClick={() => setAction({ user, kind: 'disable' })}><UserX size={16} /></IconButton></>}</div></td>
      </tr>)}
      {!users.length && <tr><td colSpan={6} className="iasEmptyCell">没有匹配的用户。</td></tr>}
    </tbody></table></div>
    <footer className="iasPagination"><span>共 {users.length} 个用户</span><div><IconButton aria-label="上一页" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}><ChevronLeft size={16} /></IconButton><span>{currentPage + 1} / {Math.max(1, Math.ceil(users.length / 20))}</span><IconButton aria-label="下一页" disabled={(currentPage + 1) * 20 >= users.length} onClick={() => setPage(currentPage + 1)}><ChevronRight size={16} /></IconButton></div></footer>
    {action && <UserActionDialog action={action} state={state} onClose={() => setAction(null)} />}
  </section>;
}
