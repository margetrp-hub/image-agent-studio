import assert from 'node:assert/strict';
import { createStandaloneAuthStore } from './studio-service/standaloneAuth.js';

const store = createStandaloneAuthStore({
  databasePath: ':memory:',
  minimumPasswordLength: 8
});

try {
  const admin = store.createUser({
    email: 'admin@example.com',
    username: 'admin',
    password: 'password8',
    role: 'admin'
  });
  const user = store.createUser({
    email: 'user@example.com',
    username: 'user',
    password: 'password8'
  });

  const settings = store.updateBillingSettings({
    creditsEnabled: true,
    rechargeEnabled: true,
    creditCodeEnabled: true,
    rechargeShopUrl: 'https://catfk.com/shop/ohlao'
  }, admin.id);
  assert.equal(settings.rechargeShopUrl, 'https://catfk.com/shop/ohlao');

  const created = store.createCreditCode({ amount: 321, actorUserId: admin.id });
  assert.match(created.code, /^OHLAO[A-F0-9]{20}$/);
  assert.equal(store.listCreditCodes()[0].redeemed, false);

  const redeemed = store.redeemCreditCode({ userId: user.id, code: created.code });
  assert.equal(redeemed.amount, 321);
  assert.equal(redeemed.balance, 321);
  assert.equal(store.getCreditSummary(user.id).lifetimeEarned, 321);
  assert.equal(store.listCreditCodes()[0].redeemed, true);

  assert.throws(
    () => store.redeemCreditCode({ userId: user.id, code: created.code }),
    (error) => error.code === 'CREDIT_CODE_USED'
  );
  assert.equal(store.listCreditTransactions(user.id)[0].kind, 'credit_code_redeem');
  console.log('Standalone billing contract check passed.');
} finally {
  store.close();
}
