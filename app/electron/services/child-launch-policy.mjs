import { normalizeSessionModel, sessionModelArgs } from '../shared/session-model.mjs';
import { launchOptionsProblem } from '../shared/launch-options.mjs';
import { selectedAccountId } from './provider-accounts.mjs';

const fail = message => Object.assign(new Error(message), { statusCode: 409 });
export function childLaunchPreferences(values, provider) {
  const prefs = JSON.parse(values?.['multiagent.agentDefaults.v1'] || '{}')[provider] || {};
  const remembered = JSON.parse(values?.['multiagent.newSessionPreferences.v1'] || '{}').dangerousByTool?.[provider];
  const remember = prefs.dangerousDefaultMode === 'remember' || prefs.dangerousDefaultMode == null && typeof prefs.dangerous === 'boolean';
  return { ...prefs, ...(remember && typeof remembered === 'boolean' ? { dangerous: remembered } : {}) };
}
export class ChildLaunchPolicy {
  constructor({ parent, preferences, defaults, accounts, models }) {
    Object.assign(this, { parent, preferences, defaults, accounts, models });
  }
  async resolve({ ownerId, aiToolId, modelSettings, accountId, dangerous }) {
    if (!['codex', 'claude'].includes(aiToolId)) throw fail('자동 하위 실행은 Codex·Claude만 지원합니다.');
    const parent = this.parent(ownerId), same = parent?.aiToolId === aiToolId;
    const identity = value => JSON.stringify([value?.id, value?.aiToolId, value?.generation, value && selectedAccountId(value), value?.codexPoolAccountId, value?.modelSettings]);
    const expected = identity(parent);
    const prefs = await this.preferences(aiToolId);
    const selected = accountId ?? (same ? selectedAccountId(parent) : prefs[aiToolId === 'claude' ? 'claudeAccountId' : 'codexAccountId']) ?? 'default';
    const account = this.accounts(aiToolId).find(item => item.id === selected);
    if (!account || !['default', 'saved'].includes(account.state)) throw fail('하위 세션 계정의 로그인을 설정에서 완료하세요.');
    const settings = normalizeSessionModel(modelSettings ?? (same ? parent.modelSettings : null) ?? this.defaults(aiToolId));
    if (modelSettings && Object.keys(modelSettings).some(key => !['model', 'effort', 'serviceTier'].includes(key))) throw fail('지원하지 않는 하위 모델 옵션입니다.');
    if (!settings || aiToolId === 'claude' && Object.hasOwn(settings, 'serviceTier')
      || aiToolId === 'codex' && Object.hasOwn(settings, 'serviceTier') && !['default', 'fast'].includes(settings.serviceTier)) throw fail('하위 세션 모델·effort·Fast 설정을 확인하세요.');
    if (launchOptionsProblem(prefs.launchOptions)) throw fail('제공자의 고급 실행 옵션을 확인하세요.');
    try { sessionModelArgs(settings, prefs.launchOptions, aiToolId); } catch (error) { throw fail(error.message); }
    const pool = aiToolId === 'codex' ? same ? parent.codexPoolAccountId || undefined : prefs.codexPoolAccountId || undefined : undefined;
    const catalog = await this.models({ provider: aiToolId, accountId: selected, codexPoolAccountId: pool, ownerId });
    const model = catalog.models.find(item => item.model === settings.model) || (same && aiToolId === 'claude'
      && parent.modelSettings?.model === settings.model ? catalog.models.find(item => ['sonnet', 'opus', 'haiku'].includes(item.model)
        && settings.model.startsWith('claude-' + item.model + '-')) : null);
    if (!model || settings.effort && !model.efforts.some(item => item.effort === settings.effort)) throw fail('선택한 계정에서 하위 세션 모델·effort를 확인하지 못했습니다. 다른 모델로 자동 변경하지 않습니다.');
    if (identity(this.parent(ownerId)) !== expected) throw fail('계정·모델 확인 중 부모 세션이 변경되었습니다. 다시 조회하세요.');
    return { modelSettings: settings, dangerous: dangerous ?? (prefs.dangerousDefaultMode === 'on' ? true
      : prefs.dangerousDefaultMode === 'off' ? false : typeof prefs.dangerous === 'boolean' ? prefs.dangerous : true),
      ...(aiToolId === 'codex' ? { codexAccountId: selected, codexPoolAccountId: pool } : { claudeAccountId: selected }) };
  }
}
