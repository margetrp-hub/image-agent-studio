import { useState } from 'react';
import { ExternalLink, Gift, WalletCards, X } from 'lucide-react';
import {
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
  IconButton,
  Input
} from '../../ui/index.js';
import '../../styles/studio.account-billing.css';

export function AccountBillingDialog({ open, onClose, client, credits, recharge, onRedeemed }) {
  const [code, setCode] = useState('');
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  if (!open) return null;

  async function redeem(event) {
    event.preventDefault();
    if (!code.trim() || !client) return;
    setSaving(true);
    setError('');
    setStatus('');
    try {
      const nextCredits = await client.redeemCreditCode(code.trim());
      setCode('');
      setStatus(`兑换成功，到账 ${Number(nextCredits?.amount || 0).toLocaleString('zh-CN')} 积分。`);
      onRedeemed?.(nextCredits);
    } catch (redeemError) {
      const messages = {
        CREDIT_CODE_INVALID: 'CDK 不正确。',
        CREDIT_CODE_USED: 'CDK 已使用或已停用。',
        CREDIT_CODE_EXPIRED: 'CDK 已过期。',
        RECHARGE_DISABLED: '充值暂未开放。'
      };
      setError(messages[redeemError?.payload?.error] || '兑换失败，请稍后重试。');
    } finally {
      setSaving(false);
    }
  }

  const enabled = recharge?.enabled && recharge?.creditCodeEnabled;

  return (
    <Dialog open onOpenChange={(nextOpen) => { if (!nextOpen) onClose?.(); }}>
      <DialogContent className="iasBillingDialog">
        <div className="iasBillingHeader"><div><span className="iasBillingKicker">ACCOUNT</span><DialogTitle>账户与积分</DialogTitle></div><DialogClose asChild><IconButton aria-label="关闭"><X size={17} /></IconButton></DialogClose></div>
        <DialogDescription className="iasBillingDescription">当前余额用于独立扣费，生成失败会自动退回。</DialogDescription>
        <div className="iasCreditBalance"><WalletCards size={18} /><span><small>可用积分</small><strong>{Number(credits?.balance || 0).toLocaleString('zh-CN')}</strong></span></div>
        {enabled ? <>
          <form className="iasBillingForm" onSubmit={redeem}>
            <label><span>CDK 兑换</span><Input value={code} onChange={(event) => setCode(event.target.value)} placeholder="输入兑换码" autoComplete="off" /></label>
            <Button variant="primary" type="submit" disabled={saving || !code.trim()}><Gift size={15} /> {saving ? '兑换中...' : '兑换积分'}</Button>
          </form>
          {recharge.shopUrl ? <a className="iasBillingShopLink" href={recharge.shopUrl} target="_blank" rel="noreferrer"><ExternalLink size={14} /> 购买 CDK</a> : null}
        </> : <div className="iasBillingDisabled">充值暂未开放。</div>}
        {status ? <p className="iasBillingStatus isSuccess">{status}</p> : null}
        {error ? <p className="iasBillingStatus isError">{error}</p> : null}
      </DialogContent>
    </Dialog>
  );
}
