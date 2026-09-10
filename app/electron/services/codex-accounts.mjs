import { ProviderAccounts } from "./provider-accounts.mjs";

export class CodexAccounts extends ProviderAccounts {
  constructor(storageDir, options) { super(storageDir, "codex", options); }
}
