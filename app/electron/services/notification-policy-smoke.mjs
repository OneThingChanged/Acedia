import assert from 'node:assert/strict';

export async function verifyNotificationPolicy(window, powerPolicy) {
  const call = (command, args = {}) => window.webContents.executeJavaScript('window.multiAgentElectron.invoke(' + JSON.stringify(command) + ',' + JSON.stringify(args) + ')');
  const original = await call('notification_preferences_get');
  try {
    let value = await call('notification_preferences_set', {patch:{powerMode:'always'}, revision:original.revision});
    assert.equal((await call('power_policy_status')).active, true);
    value = await call('notification_preferences_set', {patch:{powerMode:'working',completion:false},revision:value.revision});
    assert.equal((await call('power_policy_status')).active, false);
    assert.equal(await call('notification_policy_check',{kind:'completion'}), false);
    // Real OS blocker, synthetic hook lifecycle; no user machine sleep is triggered.
    powerPolicy.sessions(['power-fixture']); powerPolicy.hook({id:'power-fixture',event:'working'});
    assert.equal((await call('power_policy_status')).active, true);
    powerPolicy.hook({id:'power-fixture',event:'done'});
    assert.equal((await call('power_policy_status')).active, false);
    await assert.rejects(call('notification_preferences_set',{patch:{powerMode:'invalid'},revision:value.revision}));
    await assert.rejects(call('notification_preferences_set',{patch:{bell:true},revision:original.revision}));
    console.log('NOTIFICATION_NATIVE_POWER_POLICY_OK');
  } finally {
    powerPolicy.sessions([]);
    const latest = await call('notification_preferences_get');
    await call('notification_preferences_set',{patch:original,revision:latest.revision});
  }
}
