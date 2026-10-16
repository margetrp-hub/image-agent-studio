import React, { lazy, Suspense, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ArrowLeft, Check, ChevronRight, CircleAlert, Coins, Gauge, LogOut, Menu, Moon, RefreshCw, Server, Settings2, ShieldCheck, Sun, Ticket, Users, X } from 'lucide-react';
import { clearSession } from './aiGatewayClient.js';
import { Button, Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle, IconButton, Notice } from './ui/index.js';
import { useAdminData } from './admin/useAdminData.js';
import { OverviewPage, SettingsPage } from './admin/SettingsPages.jsx';
import { UsersPage } from './admin/UsersPage.jsx';
import { CodesPage } from './admin/CodesPage.jsx';
import { SystemPage } from './admin/SystemPage.jsx';
import { getErrorMessage } from './admin/adminShared.js';
import './styles/studio.admin.css';

const ProvidersPage = lazy(() => import('./admin/ProvidersPage.jsx').then((module) => ({ default: module.ProvidersPage || module.default })));
const PAGES = [
  { id: 'overview', label: '运营概览', icon: Gauge, group: '工作空间' },
  { id: 'users', label: '用户账户', icon: Users, group: '工作空间' },
  { id: 'providers', label: '供应商与定价', icon: Server, group: '系统配置' },
  { id: 'registration', label: '注册与账户', icon: ShieldCheck, group: '系统配置' },
  { id: 'billing', label: '积分与充值', icon: Coins, group: '系统配置' },
  { id: 'codes', label: '兑换码', icon: Ticket, group: '运营管理' },
  { id: 'system', label: '系统运行', icon: Settings2, group: '运营管理' }
];
const RESOURCE_LABELS = { stats: '统计', users: '用户', settings: '设置', codes: '兑换码', update: '更新状态', system: '部署配置' };

function currentPage() {
  const key = window.location.hash.slice(1);
  return PAGES.some((page) => page.id === key) ? key : 'overview';
}

function Navigation({ page, dirty, onNavigate }) {
  return <nav className="iasAdminNavigation" aria-label="管理导航">{['工作空间', '系统配置', '运营管理'].map((group) => <div className="iasNavGroup" key={group}><span>{group}</span>{PAGES.filter((item) => item.group === group).map(({ id, label, icon: Icon }) => <a key={id} href={`#${id}`} aria-label={label} aria-current={page === id ? 'page' : undefined} onClick={onNavigate}><Icon size={18} /><span>{label}</span>{dirty.includes(id) && <span className="iasDirtyDot" title="未保存" />}{page === id && <ChevronRight size={14} />}</a>)}</div>)}</nav>;
}

function AdminApp() {
  const state = useAdminData();
  const [page, setPage] = useState(currentPage);
  const [menuOpen, setMenuOpen] = useState(false);
  const [theme, setTheme] = useState(() => localStorage.getItem('image-agent-studio:theme:v1') === 'dark' ? 'dark' : 'light');
  const [logoutOpen, setLogoutOpen] = useState(false);
  const [logoutBusy, setLogoutBusy] = useState(false);
  const selected = PAGES.find((item) => item.id === page);
  const dirtyPages = ['registration', 'billing'].filter((id) => {
    const keys = id === 'registration' ? ['registrationEnabled', 'providerBindingEnabled'] : Object.keys(state.settings.draft).filter((key) => !['registrationEnabled', 'providerBindingEnabled'].includes(key));
    return keys.some((key) => state.settings.saved[key] !== state.settings.draft[key]);
  });

  useEffect(() => {
    document.documentElement.dataset.iasTheme = theme;
    localStorage.setItem('image-agent-studio:theme:v1', theme);
  }, [theme]);
  useEffect(() => {
    const navigate = () => { setPage(currentPage()); setMenuOpen(false); state.setStatus(''); state.setError(''); };
    window.addEventListener('hashchange', navigate);
    return () => window.removeEventListener('hashchange', navigate);
  }, []);
  useEffect(() => { document.title = `${selected.label} | Image Agent Studio`; document.querySelector('.iasAdminBody')?.scrollTo(0, 0); }, [page]);

  async function logout() {
    setLogoutBusy(true);
    await state.client.logout().catch(() => {});
    clearSession(); window.location.replace('./login.html');
  }

  if (!state.user) return <main className="iasAdminGate"><ShieldCheck size={28} /><h1>{state.loading ? '正在加载管理后台' : '管理员权限'}</h1>{state.error && <Notice tone="danger">{state.error}</Notice>}{!state.loading && <a href="./studio.html" className="iasButton iasButtonSecondary"><ArrowLeft size={15} />返回工作台</a>}</main>;

  return <div className="iasAdminApp">
    <a className="iasSkipLink" href="#admin-content" onClick={(event) => { event.preventDefault(); document.getElementById('admin-content')?.focus(); }}>跳到主要内容</a>
    <aside className="iasAdminSidebar"><a className="iasAdminBrand" href="./studio.html"><span className="iasAdminBrandMark">I</span><span><strong>Image Agent Studio</strong><small>管理控制台</small></span></a><Navigation page={page} dirty={dirtyPages} /><div className="iasSidebarFoot"><a href="./studio.html"><ArrowLeft size={16} />返回工作台</a><span>{state.data.update.currentVersion ? `v${state.data.update.currentVersion.replace(/^v/, '')}` : 'Image Agent Studio'}</span></div></aside>
    <div className="iasAdminWorkspace">
      <header className="iasAdminTopbar"><div className="iasAdminBreadcrumb"><IconButton className="iasMobileMenu" aria-label="打开管理导航" onClick={() => setMenuOpen(true)}><Menu size={19} /></IconButton><span>管理后台</span><ChevronRight size={14} /><strong>{selected.label}</strong></div><div className="iasAdminTopActions"><span className="iasAdminIdentity">{state.user.username || state.user.email}</span><IconButton aria-label="切换主题" title="切换主题" onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}>{theme === 'light' ? <Moon size={17} /> : <Sun size={17} />}</IconButton><IconButton aria-label="退出登录" title="退出登录" disabled={logoutBusy} onClick={() => state.dirty ? setLogoutOpen(true) : logout()}><LogOut size={17} /></IconButton></div></header>
      <main className="iasAdminBody" id="admin-content" tabIndex={-1} aria-busy={state.loading}>
        <div className="iasAdminHeading"><div><span>{selected.group}</span><h1>{selected.label}</h1></div>{page !== 'providers' && <Button onClick={() => state.refresh()} disabled={state.loading || state.saving}><RefreshCw size={15} className={state.loading ? 'iasSpin' : ''} />刷新数据</Button>}</div>
        {state.error && <Notice className="iasAdminNotice iasAlertError" tone="danger" icon={CircleAlert}>{state.error}</Notice>}
        {state.status && <Notice className="iasAdminNotice iasAlertSuccess" tone="success" icon={Check}>{state.status}</Notice>}
        {Object.keys(state.resourceErrors).length > 0 && <Notice tone="warning">{Object.keys(state.resourceErrors).map((key) => RESOURCE_LABELS[key]).join('、')}读取失败，请刷新重试。其他页面可继续使用。</Notice>}
        <div className="iasAdminPage" key={page}>
          {page === 'overview' && <OverviewPage data={state.data} settings={state.settings.saved} />}
          {page === 'users' && <UsersPage state={state} />}
          {page === 'providers' && <Suspense fallback={<p className="iasEmptyState">正在加载供应商...</p>}><ProvidersPage client={state.client} onError={(error) => state.setError(typeof error === 'string' ? error : getErrorMessage(error))} /></Suspense>}
          {['registration', 'billing'].includes(page) && <SettingsPage page={page} state={state} />}
          {page === 'codes' && <CodesPage state={state} />}
          {page === 'system' && <SystemPage state={state} />}
        </div>
      </main>
    </div>
    <Dialog open={menuOpen} onOpenChange={setMenuOpen}><DialogContent className="iasAdminNavDrawer"><div className="iasDialogHeader"><DialogTitle>管理导航</DialogTitle><DialogClose asChild><IconButton aria-label="关闭导航"><X size={18} /></IconButton></DialogClose></div><DialogDescription className="iasVisuallyHidden">选择管理页面</DialogDescription><Navigation page={page} dirty={dirtyPages} onNavigate={() => setMenuOpen(false)} /><a className="iasDrawerBack" href="./studio.html"><ArrowLeft size={16} />返回工作台</a></DialogContent></Dialog>
    <Dialog open={logoutOpen} onOpenChange={setLogoutOpen}><DialogContent className="iasDialog"><DialogTitle>有未保存的配置</DialogTitle><DialogDescription className="iasDialogHint">退出登录将丢弃未保存的修改。</DialogDescription><div className="iasDialogActions"><DialogClose asChild><Button>继续编辑</Button></DialogClose><Button variant="danger" disabled={logoutBusy} onClick={logout}>放弃并退出</Button></div></DialogContent></Dialog>
  </div>;
}

createRoot(document.querySelector('#studio-admin-root')).render(<AdminApp />);
