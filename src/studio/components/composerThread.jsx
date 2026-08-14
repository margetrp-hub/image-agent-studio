import React, { forwardRef, useState } from 'react';
import { ChevronDown, ChevronUp, History } from 'lucide-react';

export const ComposerThread = forwardRef(function ComposerThread({
  messages,
  onUseFinalPrompt,
  t = (key, fallback) => fallback || key
}, ref) {
  const recentMessages = Array.isArray(messages) ? messages.slice(-8) : [];
  const hasContent = Boolean(recentMessages.length);
  const [historyOpen, setHistoryOpen] = useState(false);

  if (!hasContent) return null;

  return (
    <div className={`composerThread ${historyOpen ? 'isHistoryOpen' : 'isHistoryCollapsed'}`} ref={ref} aria-label={t('composer.aiThread', 'AI 对话记录')}>
      <button
        type="button"
        className="composerHistoryToggle"
        onClick={() => setHistoryOpen((open) => !open)}
        aria-expanded={historyOpen}
        aria-controls="composer-thread-messages"
      >
        <History size={14} />
        <span>{t('composer.historyMessages', '历史消息')}</span>
        <em>{recentMessages.length}</em>
        {historyOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
      </button>
      {historyOpen ? (
        <div className="composerThreadMessages" id="composer-thread-messages">
          {recentMessages.map((item) => (
            <div className={`composerMessage ${item.role} ${item.pending ? 'pending' : ''} ${item.failed ? 'failed' : ''}`} key={item.id}>
              <span>{item.role === 'assistant' ? 'AI' : t('composer.you', '你')}</span>
              <div className="composerMessageBubble">
                <p>{item.content}</p>
                {item.finalPrompt ? (
                  <button type="button" onClick={() => onUseFinalPrompt(item.finalPrompt)}>
                    {t('composer.putIntoInput', '放入输入框')}
                  </button>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
});
