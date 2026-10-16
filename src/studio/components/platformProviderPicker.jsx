import { Check, RefreshCw, Server } from 'lucide-react';
import { platformModelSupports, platformPriceLabel } from '../providers/platformCatalog.js';

export function PlatformProviderPicker({ catalog, status, error, selectedId, onSelect, onRefresh }) {
  return <section className="providerLibrary" aria-label="平台供应商">
    <div className="providerLibraryHead"><strong>平台供应商</strong><button type="button" className="iconButton" title="刷新平台模型" aria-label="刷新平台模型" disabled={status === 'loading'} onClick={onRefresh}><RefreshCw size={15} /></button></div>
    {error ? <p role="alert">平台模型加载失败。<button type="button" onClick={onRefresh}>重试</button></p> : null}
    {status === 'loading' ? <p role="status">正在读取平台模型...</p> : null}
    {status === 'ready' && !catalog.creditsEnabled ? <p>平台积分调用尚未开放。</p> : null}
    {status === 'ready' && catalog.creditsEnabled && !catalog.providers.length ? <p>暂无已发布模型。</p> : null}
    <div className="providerLibraryList">{catalog.providers.map((provider) => <article className={`providerLibraryItem ${selectedId === provider.id ? 'isActive' : ''}`} key={provider.id}>
      <button type="button" className="providerLibraryItemMain" onClick={() => onSelect(provider)}>
        <span className="providerLibraryItemIcon"><Server size={15} /></span>
        <span className="providerLibraryItemText"><strong>{provider.name}</strong>{provider.models.slice(0, 3).map((model) => <small key={model.id}>{model.name || model.id} · {['image', 'edit', 'video'].filter((operation) => platformModelSupports(model, operation)).map((operation) => `${{ image: '生图', edit: '编辑', video: '视频' }[operation]} ${platformPriceLabel(model, operation)}`).join(' / ')}</small>)}{provider.models.length > 3 ? <small>另有 {provider.models.length - 3} 个模型</small> : null}</span>
        {selectedId === provider.id ? <span className="providerLibraryActive"><Check size={13} />使用中</span> : null}
      </button>
    </article>)}</div>
  </section>;
}
