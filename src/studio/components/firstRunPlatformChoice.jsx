import { useState } from 'react';
import { ArrowRight, RefreshCw } from 'lucide-react';
import { platformModelSupports, platformPriceLabel } from '../providers/platformCatalog.js';

export function FirstRunPlatformChoice({ catalogState, onSelect }) {
  const [providerId, setProviderId] = useState('');
  const [choiceId, setChoiceId] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const { catalog, status, refresh } = catalogState;
  const providers = catalog.providers.filter((provider) => provider.models.some((model) => ['image', 'edit', 'video'].some((operation) => platformModelSupports(model, operation))));
  const provider = providers.find((item) => item.id === providerId);
  const choices = (provider?.models || []).flatMap((model) => ['image', 'edit', 'video']
    .filter((operation) => platformModelSupports(model, operation))
    .map((operation) => ({ id: JSON.stringify([model.id, operation]), model, operation })));
  const selected = choices.find((item) => item.id === choiceId);
  async function select() {
    if (!provider || !selected || status !== 'ready') return;
    setBusy(true);
    setError('');
    try {
      await onSelect({ providerId: provider.id, model: selected.model.id, mode: selected.operation });
    } catch {
      setError('当前模型不可用，请刷新目录后重试。');
      setBusy(false);
    }
  }
  return <>
    <div className="firstRunBody">
      {status === 'loading' || status === 'idle' ? <p role="status">正在读取平台模型...</p> : null}
      {status === 'error' ? <div role="alert">平台模型加载失败。<button type="button" onClick={refresh}><RefreshCw size={14} />重试</button></div> : null}
      {status === 'ready' && !catalog.creditsEnabled ? <p>平台积分调用尚未开放。</p> : null}
      {status === 'ready' && catalog.creditsEnabled && !providers.length ? <p>暂无已发布模型。</p> : null}
      <div className="firstRunFields">
        <label className="firstRunWideField"><span>平台供应商</span><select aria-label="平台供应商" value={providerId} disabled={status !== 'ready' || !providers.length || busy} onChange={(event) => { setProviderId(event.target.value); setChoiceId(''); setError(''); }}>
          <option value="">选择平台供应商</option>{providers.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select></label>
        <label className="firstRunWideField"><span>平台模型</span><select aria-label="平台模型" value={choiceId} disabled={status !== 'ready' || !provider || busy} onChange={(event) => { setChoiceId(event.target.value); setError(''); }}>
          <option value="">选择平台模型</option>{choices.map((item) => <option key={item.id} value={item.id}>{item.model.name || item.model.id} · {{ image: '生图', edit: '编辑', video: '视频' }[item.operation]} · {platformPriceLabel(item.model, item.operation)}</option>)}
        </select></label>
      </div>
      {selected ? <div className="firstRunConnectionSummary"><strong>{platformPriceLabel(selected.model, selected.operation)}</strong></div> : null}
      {error ? <div className="firstRunFeedback" role="alert">{error}</div> : null}
    </div>
    <footer className="firstRunActions"><span /><button type="button" className="firstRunPrimary" disabled={!selected || status !== 'ready' || busy} onClick={select}>使用此模型<ArrowRight size={15} /></button></footer>
  </>;
}
