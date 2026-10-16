import React from 'react';
import { ArrowUpRight, Coins, Database, LockKeyhole, Save, Users, WalletCards } from 'lucide-react';
import { Button, Input, Notice, Switch } from '../ui/index.js';
import { formatNumber, SETTING_KEYS } from './adminShared.js';

function Toggle({ title, description, checked, onChange }) {
  return <div className="iasToggleRow"><span><strong>{title}</strong><small>{description}</small></span><Switch aria-label={title} checked={checked} onCheckedChange={onChange} /></div>;
}

function NumberField({ title, value, onChange }) {
  return <label className="iasField"><span>{title}</span><Input type="number" min="0" max="1000000000" step="1" required value={value} onChange={(event) => onChange(event.target.value === '' ? '' : Number(event.target.value))} /></label>;
}

export function SettingsPage({ page, state }) {
  const { settings: { saved, draft }, changeSetting, saveSettings, discardSettings, saving, loading, data, resourceErrors } = state;
  const keys = SETTING_KEYS[page];
  const dirty = keys.some((key) => saved[key] !== draft[key]);
  const set = (key) => (value) => changeSetting(key, value);
  const system = data.system;
  return <form className="iasSettingsForm" onSubmit={(event) => { event.preventDefault(); saveSettings(keys); }}>
    <fieldset disabled={saving || loading || Boolean(resourceErrors.settings)}>
      {page === 'registration' ? <>
        <section className="iasAdminSection">
          <div className="iasSectionHeader"><h2>账户注册</h2></div>
          <Toggle title="开放注册" description="允许访客创建独立的工作台账号。" checked={draft.registrationEnabled} onChange={set('registrationEnabled')} />
          {system?.registrationMode === 'disabled' && <Notice tone="warning">服务器关闭了公开注册。需要先修改部署配置 STUDIO_AUTH_REGISTRATION_MODE，后台开关才会生效。</Notice>}
          <div className="iasReadoutGrid"><div><span>密码最短长度</span><strong>{system?.passwordMinLength ? `${system.passwordMinLength} 位` : '未读取'}</strong></div><div><span>登录会话有效期</span><strong>{system?.sessionTtlMs ? `${Math.round(system.sessionTtlMs / 3600000)} 小时` : '未读取'}</strong></div></div>
        </section>
        <section className="iasAdminSection">
          <div className="iasSectionHeader"><h2>外部账户关联</h2></div>
          <Toggle title="允许账号绑定" description="用户可关联自己的 NewAPI、Sub2API 账户；平台供应商在单独页面配置。" checked={draft.providerBindingEnabled} onChange={set('providerBindingEnabled')} />
          {system?.providerSecretsConfigured === false && <Notice tone="warning">尚未配置服务端密钥 STUDIO_MASTER_KEY，账户关联暂不可用。</Notice>}
        </section>
      </> : <>
        <section className="iasAdminSection">
          <div className="iasSectionHeader"><h2>平台积分</h2><a href="#providers">供应商与模型定价 <ArrowUpRight size={14} /></a></div>
          <Toggle title="启用积分" description="平台供应商按发布的模型价格扣积分。用户自带 Key 的调用不扣平台积分。" checked={draft.creditsEnabled} onChange={set('creditsEnabled')} />
          <div className="iasCostGrid"><NumberField title="注册奖励" value={draft.registrationBonusCredits} onChange={set('registrationBonusCredits')} /></div>
          <p className="iasFieldHint">注册奖励只在积分启用后发给新注册用户，不追补历史账户。</p>
        </section>
        <section className="iasAdminSection">
          <div className="iasSectionHeader"><h2>充值入口</h2></div>
          <Toggle title="开放充值" description="允许用户通过兑换码补充积分。" checked={draft.rechargeEnabled} onChange={set('rechargeEnabled')} />
          <Toggle title="启用兑换码" description="关闭后，已发放的码暂停兑换，历史流水保留。" checked={draft.creditCodeEnabled} onChange={set('creditCodeEnabled')} />
          <label className="iasField iasWideField"><span>积分购买链接</span><Input type="url" value={draft.rechargeShopUrl} onChange={(event) => changeSetting('rechargeShopUrl', event.target.value)} placeholder="https://example.com/shop" /></label>
          {!draft.creditsEnabled && <p className="iasFieldHint">积分关闭时，充值入口与兑换码暂不可用。这里的配置会保留。</p>}
        </section>
        <section className="iasAdminSection">
          <details className="iasLegacyPricing"><summary>部署级供应商的默认价格</summary><p>仅用于旧的部署级供应商。后台内置供应商使用各自的模型定价。</p>
            <div className="iasCostGrid"><NumberField title="单次生图" value={draft.imageGenerationCost} onChange={set('imageGenerationCost')} /><NumberField title="参考图编辑" value={draft.imageEditCost} onChange={set('imageEditCost')} /><NumberField title="视频生成" value={draft.videoGenerationCost} onChange={set('videoGenerationCost')} /></div>
          </details>
        </section>
      </>}
    </fieldset>
    <footer className="iasSaveBar"><span>{dirty ? '有未保存的修改' : '所有修改已保存'}</span><div><Button variant="quiet" disabled={!dirty || saving || loading} onClick={() => discardSettings(keys)}>撤销修改</Button><Button variant="primary" type="submit" disabled={!dirty || saving || loading || Boolean(resourceErrors.settings)}><Save size={15} />{saving ? '保存中...' : '保存设置'}</Button></div></footer>
  </form>;
}

export function OverviewPage({ data, settings }) {
  const stats = data.stats;
  const metrics = [
    [Users, '注册用户', formatNumber(stats.users), `${formatNumber(stats.activeUsers)} 个正常账户`],
    [WalletCards, '可用积分', formatNumber(stats.balance), '所有用户余额'],
    [Coins, '累计消耗', formatNumber(stats.spent), `${formatNumber(stats.transactions)} 条积分流水`]
  ];
  return <>
    <section className="iasStatsGrid">{metrics.map(([Icon, title, value, detail]) => <article className="iasStatCard" key={title}><div><span>{title}</span><Icon size={17} /></div><strong>{value}</strong><small>{detail}</small></article>)}</section>
    <section className="iasAdminSection"><div className="iasSectionHeader"><h2>运行策略</h2><a href="#billing">管理配置 <ArrowUpRight size={14} /></a></div><dl className="iasPolicyList">
      <div><dt>平台积分</dt><dd>{settings.creditsEnabled ? '已启用' : '已关闭'}</dd></div>
      <div><dt>公开注册</dt><dd>{data.system?.registrationMode === 'disabled' ? '部署配置已关闭' : settings.registrationEnabled ? '已开放' : '已关闭'}</dd></div>
      <div><dt>新用户奖励</dt><dd>{settings.creditsEnabled ? `${formatNumber(settings.registrationBonusCredits)} 积分` : '积分关闭，暂不发放'}</dd></div>
      <div><dt>用户自带 Key</dt><dd>不扣平台积分</dd></div>
    </dl></section>
    <section className="iasAdminSection"><div className="iasSectionHeader"><h2>管理入口</h2></div><div className="iasQuickLinks">
      <a href="#users"><Users size={20} /><span><strong>用户账户</strong><small>查看用户、调整积分、重置密码</small></span><ArrowUpRight size={17} /></a>
      <a href="#providers"><LockKeyhole size={20} /><span><strong>供应商与定价</strong><small>连接上游、同步模型、发布价格</small></span><ArrowUpRight size={17} /></a>
      <a href="#system"><Database size={20} /><span><strong>系统运行</strong><small>运行配置与版本更新</small></span><ArrowUpRight size={17} /></a>
    </div></section>
  </>;
}

export function RuntimeSettings({ system }) {
  if (!system) return <Notice tone="warning">运行配置未读取成功，请刷新后重试。</Notice>;
  const rows = [
    ['账户数据库', system.storage || 'SQLite'],
    ['公开注册部署开关', system.registrationMode === 'open' ? '开放' : '关闭'],
    ['供应商密钥加密', system.providerSecretsConfigured ? '已配置' : '未配置'],
    ['部署默认调用方式', system.userProviderOnly ? '用户自带 Key' : '部署级供应商'],
    ['内网供应商地址', system.allowPrivateProviderUrls ? '允许' : '禁止'],
    ['任务并发上限', system.jobConcurrency === 0 ? '未设上限' : system.jobConcurrency ?? '未读取'],
    ['任务超时', system.jobTimeoutMs ? `${Math.round(system.jobTimeoutMs / 60000)} 分钟` : '未读取'],
    ['单图上传上限', system.maxImageBytes ? `${Math.round(system.maxImageBytes / 1024 / 1024)} MB` : '未读取'],
    ['视频文件上限', system.maxVideoBytes ? `${Math.round(system.maxVideoBytes / 1024 / 1024)} MB` : '未读取']
  ];
  return <section className="iasAdminSection"><div className="iasSectionHeader"><h2>部署配置</h2><span className="iasAdminBadge">只读</span></div><p className="iasFieldHint">这些配置由服务器环境管理，修改后需重启服务。</p><dl className="iasPolicyList">{rows.map(([title, value]) => <div key={title}><dt>{title}</dt><dd>{value}</dd></div>)}</dl></section>;
}
