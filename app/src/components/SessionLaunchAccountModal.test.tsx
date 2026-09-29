import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SessionLaunchAccountModal } from "./SessionLaunchAccountModal";

const accounts = [
  { id: "account-ready", label: "Work", available: true },
  { id: "account-exhausted", label: "Personal", available: false },
];

describe("SessionLaunchAccountModal", () => {
  it("offers automatic routing and eligible accounts when starting a session", () => {
    const html = renderToStaticMarkup(<SessionLaunchAccountModal
      sessionName="ImageViewer"
      accounts={accounts}
      onStart={() => {}}
      onCancel={() => {}}
    />);

    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain('value="" selected=""');
    expect(html).toContain('value="account-ready"');
    expect(html).toContain('value="account-exhausted" disabled=""');
    expect(html).toMatch(/<button class="btn-primary">세션 시작<\/button>/);
  });

  it("blocks launch when no routed account is usable", () => {
    const html = renderToStaticMarkup(<SessionLaunchAccountModal
      sessionName="ImageViewer"
      accounts={[accounts[1]]}
      initialAccountId="account-exhausted"
      onStart={() => {}}
      onCancel={() => {}}
    />);

    expect(html).toContain('role="alert"');
    expect(html).toMatch(/<button class="btn-primary" disabled="">세션 시작<\/button>/);
  });
});
