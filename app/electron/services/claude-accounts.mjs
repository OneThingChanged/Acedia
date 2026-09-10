import { ProviderAccounts } from "./provider-accounts.mjs";

export class ClaudeAccounts extends ProviderAccounts {
  constructor(storageDir, options) { super(storageDir, "claude", options); }
}
