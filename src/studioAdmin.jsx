import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  Activity,
  ArrowLeft,
  Check,
  CircleAlert,
  Coins,
  Download,
  ExternalLink,
  Gauge,
  KeyRound,
  LogOut,
  Moon,
  Plus,
  RefreshCw,
  Save,
  Search,
  Settings2,
  ShieldCheck,
  Sun,
  UserRound,
  UserX,
  WalletCards,
  X
} from 'lucide-react';
import {
  AiGatewayClient,
  clearSession,
  getLoginUrl,
  loadSession,
  STUDIO_STANDALONE
} from './aiGatewayClient.js';
import {
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
  IconButton,
  Input,
  Notice,
  Switch,
  Textarea
} from './ui/index.js';
import './styles/studio.admin.css';

const DEFAULT_SETTINGS = {
  creditsEnabled: false,
  registrationEnabled: true,
  registrationBonusCredits: 200,
  imageGenerationCost: 10,
  imageEditCost: 15,
  videoGenerationCost: 50,
  rechargeEnabled: true,
  creditCodeEnabled: true,
  providerBindingEnabled: true,
  rechargeShopUrl: 'https://catfk.com/shop/ohlao'
};

const EMPTY_STATS = {
  users: 0,
  activeUsers: 0,
  balance: 0,
  spent: 0,
  transactions: 0
};

const EMPTY_UPDATE = {
  state: 'idle',
  currentVersion: '',
  targetVersion: '',
  message: '尚未检查更新。',
  updatedAt: ''
};

function formatNumber(value) {
  return Number(value || 0).toLocaleString('zh-CN');
}

function formatDate(value) {
  if (!value) return '暂无';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '暂无' : date.toLocaleString('zh-CN', {
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'
  });
}

function getErrorMessage(error) {
  const code = error?.payload?.error || error?.code || '';
  if (code === 'ADMIN_REQUIRED') return '当前账号没有管理员权限。';
  if (code === 'INSUFFICIENT_CREDITS') return '余额不足，无法完成这次操作。';
  if (code === 'CREDIT_REASON_REQUIRED') return '请填写调账原因。';
  if (code === 'CREDIT_CODE_EXISTS') return '这个 CDK 已经存在。';
  if (code === 'INVALID_CREDIT_CODE') return 'CDK 需要 8 到 64 位字母或数字。';
  if (code === 'INVALID_RECHARGE_URL') return '购买链接必须是 http(s) 地址。';
  if (code === 'UPDATE_ALREADY_RUNNING') return '更新正在执行，请稍候查看状态。';
  if (code === 'UPDATE_SERVICE_UNAVAILABLE') return 'VPS 更新服务尚未安装，请先完成一次服务器部署。';
  return '请求没有完成，请稍后重试。';
}

function applyTheme(theme) {
  document.documentElement.dataset.iasTheme = theme;
  localStorage.setItem('image-agent-studio:theme:v1', theme);
}

function initialTheme() {
  const stored = localStorage.getItem('image-agent-studio:theme:v1');
  return stored === 'dark' ? 'dark' : 'light';
}

function LoadingState() {
  return <div className="iasAdminLoading"><RefreshCw size={20} className="iasSpin" /> 正在加载管理数据...</div>;
}

function StatCard({ icon: Icon, label, value, detail, tone = '' }) {
  return (
    <article className={`iasStatCard ${tone}`}>
      <div className="iasStatIcon"><Icon size={17} /></div>
      <div className="iasStatBody">
        <span>{label}</span>
        <strong>{value}</strong>
        <small>{detail}</small>
      </div>
    </article>
  );
}

function SettingsPanel({ settings, onChange, onSave, saving, message }) {
  return (
    <section className="iasAdminSection iasSettingsSection">
      <div className="iasSectionHeader">
        <div>
          <span className="iasSectionKicker">POLICY</span>
          <h2>注册与积分</h2>
          <p>调整后立即对新请求生效，历史账务不会被重算。</p>
        </div>
        <Settings2 size={20} className="iasSectionHeaderIcon" />
      </div>
      <div className="iasSettingGrid">
        <div className="iasToggleRow">
          <span>
            <strong>启用积分</strong>
            <small>关闭后不扣积分，用户只使用自己配置的 URL 与 Key。</small>
          </span>
          <Switch aria-label="启用积分" checked={settings.creditsEnabled} onCheckedChange={(checked) => onChange('creditsEnabled', checked)} />
        </div>
        <div className="iasToggleRow">
          <span>
            <strong>开放注册</strong>
            <small>允许新用户自行创建账号。</small>
          </span>
          <Switch aria-label="开放注册" checked={settings.registrationEnabled} onCheckedChange={(checked) => onChange('registrationEnabled', checked)} />
        </div>
      </div>
      <div className="iasCostGrid">
        <label className="iasField"><span>注册奖励</span><Input type="number" min="0" step="1" value={settings.registrationBonusCredits} onChange={(event) => onChange('registrationBonusCredits', event.target.value)} /></label>
        <label className="iasField"><span>单次生图</span><Input type="number" min="0" step="1" value={settings.imageGenerationCost} onChange={(event) => onChange('imageGenerationCost', event.target.value)} /></label>
        <label className="iasField"><span>参考图编辑</span><Input type="number" min="0" step="1" value={settings.imageEditCost} onChange={(event) => onChange('imageEditCost', event.target.value)} /></label>
        <label className="iasField"><span>视频生成</span><Input type="number" min="0" step="1" value={settings.videoGenerationCost} onChange={(event) => onChange('videoGenerationCost', event.target.value)} /></label>
      </div>
      <div className="iasSectionFooter">
        <span className="iasInlineMessage">{message || '关闭积分后，历史账务保留，新的生成不再扣除。'}</span>
        <Button variant="primary" onClick={onSave} disabled={saving}><Save size={15} /> {saving ? '保存中...' : '保存设置'}</Button>
      </div>
    </section>
  );
}

function RechargePanel({ settings, onChange, codes, onCreateCode, onDisableCode, saving }) {
  const [amount, setAmount] = useState('1000');
  const [code, setCode] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [note, setNote] = useState('');
  const [newCode, setNewCode] = useState('');
  const [error, setError] = useState('');

  async function createCode(event) {
    event.preventDefault();
    setError('');
    try {
      const created = await onCreateCode({
        amount: Number(amount),
        code: code.trim() || undefined,
        expiresAt: expiresAt || undefined,
        note: note.trim()
      });
      setNewCode(created?.code || '');
      setCode('');
      setNote('');
    } catch (createError) {
      setError(getErrorMessage(createError));
    }
  }

  return (
    <section className="iasAdminSection iasRechargeSection">
      <div className="iasSectionHeader iasSectionHeaderRow">
        <div><span className="iasSectionKicker">RECHARGE</span><h2>充值与 CDK</h2><p>购买链接和兑换码都由后台控制。</p></div>
        <a className="iasAdminLinkButton" href={settings.rechargeShopUrl} target="_blank" rel="noreferrer"><ExternalLink size={14} /> 打开购买页</a>
      </div>
      <div className="iasSettingGrid">
        <div className="iasToggleRow"><span><strong>开放充值</strong><small>允许用户兑换 CDK。</small></span><Switch aria-label="开放充值" checked={settings.rechargeEnabled} onCheckedChange={(checked) => onChange('rechargeEnabled', checked)} /></div>
        <div className="iasToggleRow"><span><strong>启用 CDK</strong><small>关闭后保留历史流水。</small></span><Switch aria-label="启用 CDK" checked={settings.creditCodeEnabled} onCheckedChange={(checked) => onChange('creditCodeEnabled', checked)} /></div>
        <div className="iasToggleRow"><span><strong>允许账号绑定</strong><small>允许用户绑定 Sub2API 或 NewAPI 账号。</small></span><Switch aria-label="允许账号绑定" checked={settings.providerBindingEnabled} onCheckedChange={(checked) => onChange('providerBindingEnabled', checked)} /></div>
      </div>
      <label className="iasField iasRechargeUrlField"><span>购买链接</span><Input value={settings.rechargeShopUrl} onChange={(event) => onChange('rechargeShopUrl', event.target.value)} /></label>
      <form className="iasCodeForm" onSubmit={createCode}>
        <label className="iasField"><span>积分数量</span><Input type="number" min="1" step="1" value={amount} onChange={(event) => setAmount(event.target.value)} /></label>
        <label className="iasField"><span>自定义 CDK（可选）</span><Input value={code} onChange={(event) => setCode(event.target.value)} placeholder="留空自动生成" /></label>
        <label className="iasField"><span>有效期（可选）</span><Input type="datetime-local" value={expiresAt} onChange={(event) => setExpiresAt(event.target.value)} /></label>
        <label className="iasField"><span>备注</span><Input value={note} onChange={(event) => setNote(event.target.value)} placeholder="例如：首发活动" maxLength="240" /></label>
        <Button variant="primary" type="submit" disabled={saving}><Plus size={15} /> 生成 CDK</Button>
      </form>
      {newCode ? <div className="iasNewCode" role="status"><span>新 CDK，只显示这一次</span><code>{newCode}</code></div> : null}
      {error ? <p className="iasFormError"><CircleAlert size={15} /> {error}</p> : null}
      <div className="iasCodeList">
        {codes.length ? codes.map((item) => <div className="iasCodeRow" key={item.id}><span><strong>{item.codeMask}</strong><small>{formatNumber(item.amount)} 积分 · {item.redeemed ? '已兑换' : item.active ? '可用' : '已停用'}{item.note ? ` · ${item.note}` : ''}</small></span>{item.active && !item.redeemed ? <Button size="small" onClick={() => onDisableCode(item)}>停用</Button> : null}</div>) : <div className="iasEmptyState">还没有 CDK。</div>}
      </div>
    </section>
  );
}

function UserTable({ users, query, onQueryChange, onAdjust, onDisable, onReset }) {
  const filteredUsers = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return users;
    return users.filter((user) => [user.email, user.username, user.role].some((value) => String(value || '').toLowerCase().includes(needle)));
  }, [query, users]);

  return (
    <section className="iasAdminSection iasUsersSection">
      <div className="iasSectionHeader iasSectionHeaderRow">
        <div>
          <span className="iasSectionKicker">ACCOUNTS</span>
          <h2>用户账户</h2>
          <p>查看状态与余额，调账会留下可追溯流水。</p>
        </div>
        <label className="iasSearchBox"><Search size={15} /><Input value={query} onChange={(event) => onQueryChange(event.target.value)} placeholder="搜索邮箱或用户名" /></label>
      </div>
      <div className="iasTableWrap">
        <table className="iasUserTable">
          <thead><tr><th>用户</th><th>角色</th><th>状态</th><th>余额</th><th>注册时间</th><th aria-label="操作" /></tr></thead>
          <tbody>
            {filteredUsers.length ? filteredUsers.map((user) => (
              <tr key={user.id}>
                <td><div className="iasUserCell"><span className="iasUserAvatar">{String(user.username || user.email || '?').slice(0, 1).toUpperCase()}</span><span><strong>{user.username}</strong><small>{user.email}</small></span></div></td>
                <td><span className={`iasRoleBadge ${user.role === 'admin' ? 'isAdmin' : ''}`}>{user.role === 'admin' ? '管理员' : '用户'}</span></td>
                <td><span className={`iasStatusDot ${user.active ? 'isActive' : 'isDisabled'}`}><i />{user.active ? '正常' : '已禁用'}</span></td>
                <td><strong className="iasBalanceValue">{formatNumber(user.credits?.balance)}</strong><small className="iasTableSubtext">已用 {formatNumber(user.credits?.lifetimeSpent)}</small></td>
                <td className="iasDateCell">{formatDate(user.createdAt)}</td>
                <td><div className="iasTableActions"><Button size="small" onClick={() => onAdjust(user)}><Coins size={14} /> 调账</Button>{user.active ? <IconButton title="生成密码重置码" aria-label="生成密码重置码" onClick={() => onReset(user)}><KeyRound size={16} /></IconButton> : null}{user.active ? <IconButton tone="danger" title="禁用账号" aria-label="禁用账号" onClick={() => onDisable(user)}><UserX size={16} /></IconButton> : null}</div></td>
              </tr>
            )) : <tr><td colSpan="6" className="iasEmptyCell">没有匹配的用户。</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  );
}

const UPDATE_STATE_LABELS = {
  idle: '等待操作',
  queued: '已提交',
  checking: '检查版本',
  current: '已是最新',
  upgrading: '更新中',
  success: '更新完成',
  failed: '更新失败',
  rollback: '已回滚'
};

function UpdatePanel({ update, busy, onRequest, onRefresh }) {
  const state = update?.state || 'idle';
  const isActive = busy || ['queued', 'checking', 'upgrading'].includes(state);
  const stateLabel = UPDATE_STATE_LABELS[state] || state;
  return (
    <section className="iasAdminSection iasUpdateSection">
      <div className="iasSectionHeader iasSectionHeaderRow">
        <div>
          <span className="iasSectionKicker">RELEASE CONTROL</span>
          <h2>系统更新</h2>
          <p>仅在管理员点击后检查 GitHub Release，并在 VPS 上执行更新。</p>
        </div>
        <div className={`iasUpdateBadge is-${state}`}><span />{stateLabel}</div>
      </div>
      <div className="iasUpdateGrid">
        <div><span>当前版本</span><strong>{update?.currentVersion ? `v${update.currentVersion.replace(/^v/, '')}` : '读取中'}</strong></div>
        <div><span>目标版本</span><strong>{update?.targetVersion ? `v${update.targetVersion.replace(/^v/, '')}` : '未检查'}</strong></div>
        <div><span>最近状态</span><strong>{update?.message || '暂无状态'}</strong></div>
        <div><span>更新时间</span><strong>{formatDate(update?.updatedAt)}</strong></div>
      </div>
      <div className="iasSectionFooter">
        <span className="iasInlineMessage">更新过程会重启历史服务，数据目录和用户账务保持不变。</span>
        <div className="iasUpdateActions">
          <Button variant="quiet" onClick={onRefresh} disabled={isActive}><RefreshCw size={15} className={isActive ? 'iasSpin' : ''} /> 刷新状态</Button>
          <Button variant="primary" onClick={onRequest} disabled={isActive}><Download size={15} /> {isActive ? '更新处理中...' : '检查并更新'}</Button>
        </div>
      </div>
    </section>
  );
}

function AdjustmentDialog({ user, onClose, onSubmit, saving }) {
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  async function submit(event) {
    event.preventDefault();
    setError('');
    if (!amount || !reason.trim()) { setError('请输入积分变动数量和原因。'); return; }
    try { await onSubmit({ amount: Number(amount), reason: reason.trim() }); } catch (submitError) { setError(getErrorMessage(submitError)); }
  }
  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="iasDialog">
        <div className="iasDialogHeader"><div><span className="iasSectionKicker">CREDIT LEDGER</span><DialogTitle id="ias-adjust-title">调整 {user.username} 的余额</DialogTitle></div><DialogClose asChild><IconButton aria-label="关闭"><X size={18} /></IconButton></DialogClose></div>
        <DialogDescription className="iasDialogHint">当前余额 <strong>{formatNumber(user.credits?.balance)}</strong>。输入正数增加，负数扣减。</DialogDescription>
        <form className="iasDialogForm" onSubmit={submit}>
          <label className="iasField"><span>变动数量</span><Input autoFocus type="number" step="1" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="例如 200 或 -50" /></label>
          <label className="iasField"><span>原因</span><Textarea value={reason} onChange={(event) => setReason(event.target.value)} placeholder="例如：活动赠送、异常补偿、人工扣减" maxLength="240" /></label>
          {error ? <p className="iasFormError"><CircleAlert size={15} /> {error}</p> : null}
          <div className="iasDialogActions"><DialogClose asChild><Button variant="quiet">取消</Button></DialogClose><Button variant="primary" type="submit" disabled={saving}><Check size={15} /> {saving ? '提交中...' : '确认调账'}</Button></div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function AdminApp() {
  const [theme, setTheme] = useState(initialTheme);
  const [client, setClient] = useState(null);
  const [user, setUser] = useState(null);
  const [stats, setStats] = useState(EMPTY_STATS);
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [users, setUsers] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [codes, setCodes] = useState([]);
  const [update, setUpdate] = useState(EMPTY_UPDATE);
  const [updateBusy, setUpdateBusy] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedUser, setSelectedUser] = useState(null);
  const [passwordReset, setPasswordReset] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');

  useEffect(() => applyTheme(theme), [theme]);

  useEffect(() => {
    if (!STUDIO_STANDALONE) { window.location.replace('./studio.html'); return; }
    const session = loadSession();
    if (!session?.accessToken) { window.location.replace(getLoginUrl()); return; }
    const nextClient = new AiGatewayClient({ session });
    setClient(nextClient);
    nextClient.me().then((nextUser) => {
      if (nextUser?.role !== 'admin') throw Object.assign(new Error('ADMIN_REQUIRED'), { payload: { error: 'ADMIN_REQUIRED' } });
      setUser(nextUser);
      return Promise.all([nextClient.getAdminBillingStats(), nextClient.getAdminBillingSettings(), nextClient.listAdminUsers(), nextClient.listCreditTransactions(80), nextClient.listAdminCreditCodes(), nextClient.getAdminUpdateStatus()]);
    }).then(([nextStats, nextSettings, nextUsers, ledger, nextCodes, nextUpdate]) => {
      setStats(nextStats);
      setSettings({ ...DEFAULT_SETTINGS, ...nextSettings });
      setUsers(nextUsers);
      setTransactions(ledger.transactions || []);
      setCodes(nextCodes);
      setUpdate({ ...EMPTY_UPDATE, ...nextUpdate });
    }).catch((loadError) => {
      if (loadError?.payload?.error === 'ADMIN_REQUIRED') setError('当前账号没有管理员权限，请返回工作台。');
      else { clearSession(); window.location.replace(getLoginUrl()); }
    }).finally(() => setLoading(false));
  }, []);

  async function refresh() {
    if (!client) return;
    setLoading(true); setError('');
    try {
      const [nextStats, nextSettings, nextUsers, ledger, nextUser, nextCodes, nextUpdate] = await Promise.all([client.getAdminBillingStats(), client.getAdminBillingSettings(), client.listAdminUsers(), client.listCreditTransactions(80), client.me(), client.listAdminCreditCodes(), client.getAdminUpdateStatus()]);
      setStats(nextStats); setSettings({ ...DEFAULT_SETTINGS, ...nextSettings }); setUsers(nextUsers); setTransactions(ledger.transactions || []); setUser(nextUser); setCodes(nextCodes); setUpdate({ ...EMPTY_UPDATE, ...nextUpdate }); setStatus('数据已更新。');
    } catch (refreshError) { setError(getErrorMessage(refreshError)); }
    finally { setLoading(false); }
  }

  async function saveSettings() {
    setSaving(true); setError('');
    try { const next = await client.updateAdminBillingSettings(settings); setSettings({ ...DEFAULT_SETTINGS, ...next }); setStatus('设置已保存。'); }
    catch (saveError) { setError(getErrorMessage(saveError)); }
    finally { setSaving(false); }
  }

  async function adjustUser(input) {
    setSaving(true); setError('');
    try { await client.adjustAdminUserCredits(selectedUser.id, input); setSelectedUser(null); setStatus('积分流水已写入。'); await refresh(); }
    catch (adjustError) { throw adjustError; }
    finally { setSaving(false); }
  }

  async function disableUser(target) {
    if (!window.confirm(`确定禁用 ${target.username} 吗？这会立即注销其会话。`)) return;
    setError('');
    try { await client.disableAdminUser(target.id); setStatus('账号已禁用。'); await refresh(); }
    catch (disableError) { setError(getErrorMessage(disableError)); }
  }

  async function resetUserPassword(target) {
    if (!window.confirm(`为 ${target.username} 生成一次性密码重置码吗？`)) return;
    setSaving(true); setError(''); setPasswordReset(null);
    try {
      const result = await client.createAdminPasswordReset(target.id);
      setPasswordReset({ ...result, username: target.username });
      setStatus('密码重置码已生成，请仅发送给账号本人。');
    } catch (resetError) { setError(getErrorMessage(resetError)); }
    finally { setSaving(false); }
  }

  async function createCode(input) {
    setSaving(true); setError('');
    try { const created = await client.createAdminCreditCode(input); setStatus('CDK 已创建。'); await refresh(); return created; }
    catch (createError) { setError(getErrorMessage(createError)); throw createError; }
    finally { setSaving(false); }
  }

  async function disableCode(target) {
    if (!window.confirm(`确定停用 ${target.codeMask} 吗？`)) return;
    setSaving(true); setError('');
    try { await client.disableAdminCreditCode(target.id); setStatus('CDK 已停用。'); await refresh(); }
    catch (disableError) { setError(getErrorMessage(disableError)); }
    finally { setSaving(false); }
  }

  async function refreshUpdateStatus() {
    if (!client) return;
    try { setUpdate({ ...EMPTY_UPDATE, ...(await client.getAdminUpdateStatus()) }); }
    catch (updateError) { setError(getErrorMessage(updateError)); }
  }

  async function requestUpdate() {
    if (!client) return;
    setUpdateBusy(true); setError('');
    try {
      setUpdate({ ...EMPTY_UPDATE, ...(await client.requestAdminUpdate()) });
      setStatus('更新请求已提交，VPS 正在检查 GitHub Release。');
      for (let attempt = 0; attempt < 90; attempt += 1) {
        await new Promise((resolve) => window.setTimeout(resolve, 2000));
        try {
          const nextUpdate = await client.getAdminUpdateStatus();
          setUpdate({ ...EMPTY_UPDATE, ...nextUpdate });
          if (['current', 'success', 'failed', 'rollback'].includes(nextUpdate?.state)) break;
        } catch { /* the service may be restarting; the next poll will reconnect */ }
      }
    } catch (updateError) { setError(getErrorMessage(updateError)); }
    finally { setUpdateBusy(false); }
  }

  if (error && !user) return <main className="iasAdminGate"><ShieldCheck size={28} /><h1>管理员权限</h1><p>{error}</p><a className="iasButton iasButtonSecondary" href="./studio.html"><ArrowLeft size={15} /> 返回工作台</a></main>;
  if (loading && !user) return <main className="iasAdminGate"><LoadingState /></main>;

  return (
    <main className="iasAdminApp">
      <header className="iasAdminTopbar">
        <a className="iasAdminBrand" href="./studio.html"><span className="iasAdminBrandMark">I</span><span><strong>Image Agent Studio</strong><small>管理控制台</small></span></a>
        <div className="iasAdminTopActions"><span className="iasAdminIdentity"><UserRound size={15} /> {user?.username || user?.email}</span><IconButton onClick={() => setTheme((value) => value === 'dark' ? 'light' : 'dark')} aria-label="切换主题">{theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}</IconButton><Button variant="quiet" onClick={async () => { await client.logout().catch(() => {}); clearSession(); window.location.replace('./login.html'); }}><LogOut size={15} /> 退出</Button></div>
      </header>
      <div className="iasAdminBody">
        <div className="iasAdminHeading"><div><span className="iasSectionKicker">CONTROL PLANE</span><h1>运营概览</h1><p>账户、积分与生成策略集中在这里管理。</p></div><Button onClick={refresh} disabled={loading}><RefreshCw size={15} className={loading ? 'iasSpin' : ''} /> 刷新数据</Button></div>
        {error ? <Notice className="iasAdminNotice iasAlertError" tone="danger" icon={CircleAlert}>{error}</Notice> : null}
        {status ? <Notice className="iasAdminNotice iasAlertSuccess" tone="success" icon={Check}>{status}</Notice> : null}
        <section className="iasStatsGrid"><StatCard icon={UserRound} label="注册用户" value={formatNumber(stats.users)} detail={`${formatNumber(stats.activeUsers)} 个账号正常使用`} /><StatCard icon={WalletCards} label="当前余额" value={formatNumber(stats.balance)} detail="所有用户可用积分" tone="isTeal" /><StatCard icon={Activity} label="累计消耗" value={formatNumber(stats.spent)} detail={`${formatNumber(stats.transactions)} 条账务流水`} tone="isWarm" /><StatCard icon={Gauge} label="运行策略" value={settings.creditsEnabled ? '积分计费' : '自由试用'} detail={`注册奖励 ${formatNumber(settings.registrationBonusCredits)} 积分`} /></section>
        <UpdatePanel update={update} busy={updateBusy} onRequest={requestUpdate} onRefresh={refreshUpdateStatus} />
        <div className="iasAdminColumns"><SettingsPanel settings={settings} onChange={(key, value) => setSettings((current) => ({ ...current, [key]: typeof current[key] === 'boolean' ? Boolean(value) : Math.max(0, Number(value) || 0) }))} onSave={saveSettings} saving={saving} message={status} /><section className="iasAdminSection iasLedgerSection"><div className="iasSectionHeader"><div><span className="iasSectionKicker">LEDGER</span><h2>最近流水</h2><p>积分变动。</p></div><Coins size={20} className="iasSectionHeaderIcon" /></div><div className="iasLedgerList">{transactions.length ? transactions.slice(0, 8).map((item) => <div className="iasLedgerItem" key={item.id}><span className={`iasLedgerSign ${item.delta >= 0 ? 'isPlus' : 'isMinus'}`}>{item.delta >= 0 ? '+' : ''}{formatNumber(item.delta)}</span><span><strong>{item.kind === 'registration_bonus' ? '注册奖励' : item.kind === 'generation_charge' ? '生成扣除' : item.kind === 'generation_refund' ? '生成退回' : item.kind === 'credit_code_redeem' ? 'CDK 兑换' : '管理员调账'}</strong><small>{formatDate(item.createdAt)}</small></span><b>{formatNumber(item.balanceAfter)}</b></div>) : <div className="iasEmptyState">还没有账务流水。</div>}</div></section></div>
        <RechargePanel settings={settings} onChange={(key, value) => setSettings((current) => ({ ...current, [key]: typeof current[key] === 'boolean' ? Boolean(value) : key === 'rechargeShopUrl' ? String(value) : Math.max(0, Number(value) || 0) }))} codes={codes} onCreateCode={createCode} onDisableCode={disableCode} saving={saving} />
        <UserTable users={users} query={query} onQueryChange={setQuery} onAdjust={setSelectedUser} onDisable={disableUser} onReset={resetUserPassword} />
        {passwordReset ? <section className="iasResetTokenPanel" role="status"><div><span className="iasSectionKicker">ONE-TIME TOKEN</span><h2>{passwordReset.username} 的密码重置码</h2><p>30 分钟内有效，只显示在当前页面。用户在登录页点“忘记密码？”后输入此码。</p></div><code>{passwordReset.token}</code><Button variant="quiet" onClick={() => setPasswordReset(null)}>关闭</Button></section> : null}
      </div>
      {selectedUser ? <AdjustmentDialog user={selectedUser} onClose={() => setSelectedUser(null)} onSubmit={adjustUser} saving={saving} /> : null}
    </main>
  );
}

createRoot(document.querySelector('#studio-admin-root')).render(<AdminApp />);
