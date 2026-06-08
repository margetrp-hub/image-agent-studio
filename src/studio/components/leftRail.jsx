import React from 'react';
import {
  BotMessageSquare,
  CirclePlus,
  History,
  Images,
  KeyRound,
  Languages,
  MessageSquareText,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Sparkles,
  Sun,
  Trash2,
  Video,
  WandSparkles
} from 'lucide-react';
import { ProtectedHistoryThumb } from './media.jsx';
import {
  groupHistorySessions,
  historyResultItems,
  historyResultUrls,
  safeImageCandidate
} from '../util/historyView.js';
import { formatHistoryTime } from '../util/resultFiles.js';

function compactRailText(value, length = 180) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  return text.length > length ? `${text.slice(0, length)}...` : text;
}

export function LeftRail({
  activeWorkspace,
  onWorkspaceChange,
  onNewSession,
  accountLabel,
  accountDetail,
  onOpenSettings,
  theme,
  onThemeToggle,
  currentProject,
  historyItems,
  selectedHistoryId,
  onSelectHistory,
  onDeleteHistory,
  onFocusCurrentProject,
  collapsed,
  onToggleCollapse,
  currentLanguage,
  onLanguageToggle,
  t = (key, fallback) => fallback || key
}) {
  const isInspirationWorkspace = activeWorkspace === 'inspiration';
  const isHistoryWorkspace = activeWorkspace === 'history';
  const safeAccountLabel = accountLabel || t('rail.notLoggedIn', '未登录');
  const safeAccountDetail = accountDetail || t('rail.chooseKey', '选择 Key');
  const currentProjectId = currentProject?.sessionId || currentProject?.id || '';
  const currentRecordIds = new Set(currentProject?.recordIds || []);
  const historySessionItems = groupHistorySessions(historyItems || []);
  const recentProjectItems = [
    currentProject,
    ...historySessionItems.filter((item) => {
      const itemId = item.sessionId || item.id;
      if (itemId === currentProjectId) return false;
      return !(item.recordIds || [item.id]).some((recordId) => currentRecordIds.has(recordId));
    })
  ].filter(Boolean).slice(0, 5);

  if (collapsed) {
    return (
      <aside className="templateRail collapsed" aria-label={t('rail.aria', '创作侧栏')}>
        <button type="button" className="railIconAction" onClick={onToggleCollapse} aria-label={t('rail.expand', '展开侧栏')}>
          <PanelLeftOpen size={18} />
        </button>
        <button type="button" className="railIconAction active" onClick={onToggleCollapse} aria-label={t('rail.session', '会话')}>
          <MessageSquareText size={18} />
        </button>
        <button
          type="button"
          className={`railIconAction ${isHistoryWorkspace ? 'active' : ''}`}
          data-workspace="history"
          onClick={() => { onWorkspaceChange('history'); onToggleCollapse(); }}
          aria-label={t('rail.history', '历史图库')}
        >
          <History size={18} />
          <span>{historySessionItems.length}</span>
        </button>
        <button
          type="button"
          className={`railIconAction ${isInspirationWorkspace ? 'active' : ''}`}
          data-workspace="inspiration"
          onClick={() => { onWorkspaceChange('inspiration'); onToggleCollapse(); }}
          aria-label={t('rail.inspiration', '灵感库')}
        >
          <Sparkles size={18} />
        </button>
        <div className="collapsedRailBottom">
          <button
            type="button"
            className="railIconAction railLanguageButton"
            onClick={onLanguageToggle}
            aria-label={t('language.switchTo', 'Switch language')}
            title={`${t('language.current', '当前语言')} · ${t('language.switchTo', 'Switch language')}`}
          >
            <Languages size={16} />
            <span>{currentLanguage?.shortLabel || ''}</span>
          </button>
          <button type="button" className="railAvatarButton" data-action="open-settings" onClick={onOpenSettings} aria-label={t('rail.settings', '连接设置')}>
            <span className="collapsedRailAvatar">{String(safeAccountLabel).slice(0, 1).toUpperCase()}</span>
          </button>
        </div>
      </aside>
    );
  }

  return (
    <aside className="templateRail" aria-label={t('rail.aria', '创作侧栏')}>
      <div className="sideBrand">
        <span className="sideBrandMark"><WandSparkles size={15} /></span>
        <span>
          <strong>{t('rail.brand', '工作台')}</strong>
          <em>{t('rail.brandMeta', '创作')}</em>
        </span>
        <button type="button" className="sideCollapseButton" onClick={onToggleCollapse} aria-label={t('rail.collapse', '收起侧栏')}>
          <PanelLeftClose size={15} />
        </button>
      </div>
      <button type="button" className="newChatButton" onClick={onNewSession}>
        <CirclePlus size={16} />
        {t('rail.newSession', '新建会话')}
      </button>
      <nav className="sidePrimaryNav" aria-label={t('rail.workspaces', '工作区')}>
        <button type="button" className={activeWorkspace === 'image' || activeWorkspace === 'video' ? 'active' : ''} data-workspace="image" onClick={() => onWorkspaceChange('image')}>
          <MessageSquareText size={16} />
          {t('workspace.desk', '工作台')}
        </button>
        <button type="button" className={isHistoryWorkspace ? 'active' : ''} data-workspace="history" onClick={() => onWorkspaceChange('history')}>
          <History size={16} />
          {t('workspace.history', '历史图库')}
        </button>
        <button type="button" className={isInspirationWorkspace ? 'active' : ''} data-workspace="inspiration" onClick={() => onWorkspaceChange('inspiration')}>
          <Sparkles size={16} />
          {t('workspace.inspiration', '灵感库')}
        </button>
      </nav>
      <div className="sideChatBlock">
        <div className="sideProjectHead">
          <span className="sideSectionLabel">{t('rail.project', '项目')}</span>
          <button type="button" onClick={() => onWorkspaceChange('history')}>{t('rail.all', '全部')}</button>
        </div>
        {recentProjectItems.length ? (
          <div className="sideProjectList">
            {recentProjectItems.map((item, index) => {
              const isVideo = item.mode === 'video' || item.kind === 'video';
              const resultItems = historyResultItems(item);
              const urls = resultItems.length
                ? resultItems.map((result) => result.displayUrl || result.url).filter(Boolean)
                : historyResultUrls(item);
              const title = item.titleKey
                ? t(item.titleKey, item.title || '')
                : item.title || (isVideo ? t('rail.videoGeneration', '视频生成') : item.case?.title || compactRailText(item.prompt, 24) || t('rail.unnamedSession', '未命名会话'));
              const count = urls.length;
              const thumb = safeImageCandidate(urls[0] || item.case?.image || item.case?.thumbnail || '');
              const orderLabel = item.current ? t('rail.current', '当前') : `#${index}`;
              const meta = [
                formatHistoryTime(item.createdAt),
                compactRailText(item.model || item.providerId || '', 12)
              ].filter(Boolean).join(' · ');
              const resultLabel = item.canvasCount
                ? t('rail.nodeCount', '{count} 节点', { count: item.canvasCount })
                : isVideo
                  ? t('rail.video', '视频')
                  : count
                    ? t('rail.imageCount', '{count} 张', { count })
                    : item.queueCount
                      ? t('rail.taskCount', '{count} 个任务', { count: item.queueCount })
                      : t('rail.noResultYet', '待生成');
              const summary = compactRailText(item.prompt || item.generationPrompt || item.case?.promptPreview || '', 34);
              const activeRecordIds = item.recordIds || [item.id];
              const isActiveProject = item.current
                || selectedHistoryId === item.id
                || selectedHistoryId === item.sessionId
                || activeRecordIds.includes(selectedHistoryId);
              return (
                <div className={`sideProjectItem ${isActiveProject ? 'active' : ''}`} key={item.id}>
                  <button
                    type="button"
                    className="sideProjectOpen"
                    onClick={() => {
                      if (item.current) {
                        onWorkspaceChange('image');
                        onFocusCurrentProject?.();
                        return;
                      }
                      onSelectHistory(item);
                    }}
                  >
                    <span className="sideProjectThumb">
                      {thumb ? (
                        <ProtectedHistoryThumb
                          src={thumb}
                          fallback={<span className="sideProjectFallback">{isVideo ? <Video size={16} /> : <Images size={16} />}</span>}
                        />
                      ) : (
                        <span className="sideProjectFallback">{isVideo ? <Video size={16} /> : <Images size={16} />}</span>
                      )}
                      <span className="sideProjectIndex">{orderLabel}</span>
                    </span>
                    <span className="sideProjectText">
                      <span className="sideProjectTopline">
                        <strong>{title}</strong>
                        <b>{resultLabel}</b>
                      </span>
                      {meta ? <em>{meta}</em> : null}
                      {summary ? <small>{summary}</small> : null}
                    </span>
                  </button>
                  <button
                    type="button"
                    className="sideProjectDelete"
                    onClick={() => {
                      if (item.current) {
                        onNewSession();
                        return;
                      }
                      onDeleteHistory(item);
                    }}
                    aria-label={`删除 ${title}`}
                    title={item.current ? t('rail.clearCurrent', '清空当前会话') : t('rail.delete', '删除')}
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              );
            })}
          </div>
        ) : (
          <button type="button" className="sideChatCard emptyProjectCard" onClick={onNewSession}>
            <span className="sideChatIcon"><BotMessageSquare size={16} /></span>
            <span>
              <strong>{t('rail.noProject', '还没有项目')}</strong>
              <em>{t('rail.noProjectHint', '新建会话后，生成记录会出现在这里。')}</em>
            </span>
          </button>
        )}
      </div>
      <div className="railBottomBar">
        <button type="button" className="railAccountCard" data-action="open-settings" onClick={onOpenSettings}>
          <span className="railAvatar">{String(safeAccountLabel).slice(0, 1).toUpperCase()}</span>
          <span>
            <strong>{safeAccountLabel}</strong>
            <em>{safeAccountDetail}</em>
          </span>
          <KeyRound size={15} />
        </button>
        <div className="railPreferenceRow">
          <button
            type="button"
            className="railThemeButton railLanguageButton"
            onClick={onLanguageToggle}
            aria-label={t('language.switchTo', 'Switch language')}
            title={`${t('language.current', '当前语言')} · ${t('language.switchTo', 'Switch language')}`}
          >
            <Languages size={16} />
            <span>{currentLanguage?.shortLabel || ''}</span>
          </button>
          <button type="button" className="railThemeButton" onClick={onThemeToggle} aria-label={theme === 'dark' ? t('rail.light', '切换浅色') : t('rail.dark', '切换深色')}>
            {theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
          </button>
        </div>
      </div>
    </aside>
  );
}
