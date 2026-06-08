import React from 'react';
import { ArrowDown, Maximize2, PanelLeftOpen, Sparkles, X } from 'lucide-react';

export function BottomComposerPanel({
  children,
  composerFolded,
  composerRouteLabel,
  composerThreadHasContent,
  hasLiveStatus,
  hasLineage,
  hasReferences,
  isOpen,
  paramsExpanded,
  selectedCanvasNode,
  onClose,
  onFoldToggle,
  onOpen,
  t = (key, fallback) => fallback || key
}) {
  const className = [
    'bottomComposerBar',
    hasLineage ? 'hasLineage' : '',
    isOpen && composerThreadHasContent ? 'hasThread' : 'noThread',
    hasLiveStatus ? 'hasLiveStatus' : 'noLiveStatus',
    paramsExpanded ? 'paramsExpanded' : 'paramsCollapsed',
    composerFolded ? 'isFolded' : 'isExpandedComposer',
    hasReferences ? 'hasReferences' : 'noReferences'
  ].filter(Boolean).join(' ');
  const showCloseAction = !composerFolded;

  if (!isOpen) {
    return (
      <button
        type="button"
        className="bottomComposerReopenDock"
        onClick={onOpen}
        aria-label={t('composer.expand', '展开对话')}
        title={t('composer.expand', '展开对话')}
      >
        <span className="bottomComposerReopenIcon"><PanelLeftOpen size={17} /></span>
        <span className="bottomComposerReopenText">
          <strong>{t('composer.openConversation', '打开创作会话')}</strong>
          <small>{t('composer.openConversationHint', '继续输入提示词、优化或生成')}</small>
        </span>
      </button>
    );
  }

  return (
    <div className={className}>
      <div className="composerPanelHead">
        <div className="composerSessionIdentity">
          <span className="composerSessionIcon"><Sparkles size={17} /></span>
          <div className="composerPanelTitle">
            <strong>{t('composer.conversation', '创作会话')}</strong>
            <span>
              {selectedCanvasNode ? t('composer.selected', '基于画布 #{index}', { index: selectedCanvasNode.canvasIndex || '' }) : t('composer.defaultTitle', '提示词优化与生成')}
              <em>{composerRouteLabel}</em>
            </span>
          </div>
        </div>
        <div className="composerHeaderActions">
          <button
            type="button"
            className="composerIconPill composerFoldTogglePill"
            onClick={onFoldToggle}
            aria-label={composerFolded ? t('composer.expandPanel', '展开对话面板') : t('composer.foldPanel', '折叠对话面板')}
            title={composerFolded ? t('composer.expandPanel', '展开对话面板') : t('composer.foldPanel', '折叠对话面板')}
          >
            {composerFolded ? <Maximize2 size={15} /> : <ArrowDown size={15} />}
          </button>
          {showCloseAction ? (
            <button
              type="button"
              className="composerIconPill composerClosePill"
              onClick={onClose}
              aria-label={t('composer.close', '关闭会话')}
              title={t('composer.close', '关闭会话')}
            >
              <X size={16} />
            </button>
          ) : null}
        </div>
      </div>
      {children}
    </div>
  );
}
