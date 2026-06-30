import { ArrowLeft, KeyRound, LogOut, Moon, Server, Sun, WandSparkles } from 'lucide-react';

import { assetPath } from '../util/assets.js';
import { providerLabel } from '../util/providerSettings.js';

function workspaceConnectionLabel(activeWorkspace, defaultLabel) {
  if (activeWorkspace === 'video') return '视频接口';
  if (activeWorkspace === 'inspiration') return '灵感库';
  if (activeWorkspace === 'history') return '历史图库';
  return defaultLabel;
}

export function Topbar({
  profile,
  apiKey,
  providerSettings,
  isAuthenticated,
  activeWorkspace,
  onWorkspaceChange,
  t,
  theme,
  onLogin,
  onLogout,
  onOpenSettings,
  onThemeToggle,
  workspaces,
  studioBackUrl,
  imageGenerationRouteLabel
}) {
  return (
    <header className="studioTopbar">
      <div className="topbarBrandGroup">
        <a className="brandLockup" href={assetPath(studioBackUrl)} aria-label={t('app.back', '返回画廊')} title={t('app.back', '返回画廊')}>
          <ArrowLeft className="brandBackIcon" size={18} />
          <WandSparkles size={21} />
          <span>{t('app.brand', '创作工作台')}</span>
        </a>
        <nav className="workspaceNav" aria-label={t('topbar.navAria', '创作工作区')}>
          {workspaces.map((item) => (
            <button
              type="button"
              className={activeWorkspace === item.value ? 'active' : ''}
              data-top-workspace={item.value}
              key={item.value}
              onClick={() => onWorkspaceChange(item.value)}
            >
              {t(`workspace.${item.value}`, item.label)}
            </button>
          ))}
        </nav>
      </div>
      <div className="topbarActions">
        <button type="button" className="connectionPill" onClick={onOpenSettings}>
          <Server size={15} />
          <span>{providerLabel(providerSettings, apiKey)}</span>
          <strong>{workspaceConnectionLabel(activeWorkspace, imageGenerationRouteLabel)}</strong>
        </button>
        {isAuthenticated ? (
          <>
            <button type="button" className="iconButton themeButton" onClick={onThemeToggle} aria-label={theme === 'dark' ? t('topbar.light', '切换浅色') : t('topbar.dark', '切换深色')}>
              {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
            </button>
            <button type="button" className="iconButton" onClick={onLogout} aria-label={t('topbar.logout', '退出')}>
              <LogOut size={18} />
            </button>
          </>
        ) : (
          <>
            <button type="button" className="iconButton themeButton" onClick={onThemeToggle} aria-label={theme === 'dark' ? t('topbar.light', '切换浅色') : t('topbar.dark', '切换深色')}>
              {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
            </button>
            <button type="button" className="topbarLogin" onClick={onLogin}>
              <KeyRound size={16} />
              {t('topbar.login', '登录')}
            </button>
          </>
        )}
      </div>
    </header>
  );
}
