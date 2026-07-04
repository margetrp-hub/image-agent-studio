import React, { forwardRef } from 'react';

export const ComposerThread = forwardRef(function ComposerThread({
  messages,
  onUseFinalPrompt,
  t = (key, fallback) => fallback || key
}, ref) {
  const recentMessages = Array.isArray(messages) ? messages.slice(-8) : [];
  const hasContent = Boolean(recentMessages.length);

  return (
    <div className={`composerThread ${hasContent ? '' : 'isEmpty'}`} ref={ref} aria-label={t('composer.aiThread', 'AI 对话记录')}>
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
  );
});
