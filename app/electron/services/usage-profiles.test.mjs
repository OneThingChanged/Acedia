import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { UsageService } from "./usage-service.mjs";
import { LocalDashboardService, RemoteDashboardService } from "./web-services.mjs";
import contract from "../ipc-contract.cjs";
const resources = [];
afterEach(async () => { for (const { root, usage, servers } of resources.splice(0)) { await Promise.all(servers.map(server => server.stop())); usage.close(); fs.rmSync(root, { recursive: true, force: true }); } });
const id = "11111111-1111-4111-8111-111111111111", otherId = "22222222-2222-4222-8222-222222222222";
function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "acedia-usage-profiles-"));
  const usage = new UsageService(path.join(root, "usage.db"), { scan: async () => [] });
  const resource = { root, usage, servers: [] }; resources.push(resource);
  usage.accountProfiles = () => [{ id, label: "Same label" }, { id: otherId, label: "Same label" }];
  const updatedAt = Math.floor(Date.now()/1000);
  for (const limitId of ["codex", `codex:${id}`, `codex:${otherId}`, "claude", "claude:weekly:fable", `claude:${id}`, `claude:${id}:weekly:fable`]) usage.writeRateLimitSnapshot({ limitId, limitName: "Same label", planType: "plus", primary: { usedPercent: 25, windowMinutes: 300, resetsAt: updatedAt+500 }, secondary: null, hasCredits: false, unlimited: false, creditBalance: null, sourcePath: "fixture", updatedAt });
  return resource;
}
describe("account quota profile visibility", () => {
  it("keeps equal names and percentages distinct, and links model windows by account id", () => {
    const { usage } = fixture();
    usage.syncCatalog([], [{ aiToolId: "codex", codexAccountId: id }, { aiToolId: "claude", claudeAccountId: id, sshHostId: "remote" }]);
    const limits = usage.rateLimitSummary().limits;
    expect(limits.find(limit=>limit.limitId===`codex:${id}`).profile).toMatchObject({current:true,visible:true});
    expect(limits.find(limit=>limit.limitId===`codex:${otherId}`).profile).toMatchObject({current:false,visible:false});
    expect(limits.find(limit=>limit.limitId===`claude:${id}:weekly:fable`).profile).toMatchObject({key:`claude:${id}`,current:false});
    expect(limits.find(limit=>limit.limitId==="claude:weekly:fable").profile.key).toBe("claude:default");
    expect(new Set(limits.map(limit=>limit.profile.key)).size).toBe(5);
  });
  it("persists reversible display choices without changing snapshots or source files", () => {
    const { usage, root } = fixture();
    const transcript = path.join(root, "untouched.jsonl"); fs.writeFileSync(transcript,"original history");
    const snapshot = () => usage.db().prepare("SELECT * FROM usage_rate_limits ORDER BY limit_id").all();
    const before = snapshot();
    usage.setProfileVisibility(`claude:${id}`, true);
    expect(usage.rateLimitSummary().limits.filter(limit=>limit.profile.key===`claude:${id}`).every(limit=>limit.profile.hidden && !limit.profile.visible)).toBe(true);
    usage.close();
    expect(usage.rateLimitSummary().limits.find(limit=>limit.limitId===`claude:${id}`).profile.hidden).toBe(true);
    usage.setProfileVisibility(`claude:${id}`, false);
    expect(usage.rateLimitSummary().limits.find(limit=>limit.limitId===`claude:${id}`).profile).toMatchObject({current:false,hidden:false,visible:true});
    expect(snapshot()).toEqual(before); expect(fs.readFileSync(transcript,"utf8")).toBe("original history");
  });
  it("preserves snapshots of removed profiles and rejects unknown or malformed preferences", () => {
    const { usage } = fixture(); usage.accountProfiles = () => [];
    expect(usage.rateLimitSummary().limits.find(limit=>limit.limitId===`codex:${id}`).profile).toMatchObject({registered:false,current:false});
    for (const [key,hidden] of [["codex:unknown",true],[`codex:${id}`,"true"],[`codex:33333333-3333-4333-8333-333333333333`,true]]) expect(()=>usage.setProfileVisibility(key,hidden)).toThrow();
    expect(()=>contract.assertInvokeRequest("usage_profile_visibility_set",{profileKey:`codex:${id}`,hidden:"true"})).toThrow();
    expect(contract.assertInvokeRequest("usage_profile_visibility_set",{profileKey:`codex:${id}`,hidden:true})).toEqual({profileKey:`codex:${id}`,hidden:true});
  });
  for (const remote of [false,true]) it(`guards ${remote ? "remote" : "local"} visibility writes and shares usage responses`, async () => {
    const {usage,root,servers}=fixture();
    const providers={usageProvider:()=>usage.rateLimitSummary(),usageProfileVisibility:(key,hidden)=>usage.setProfileVisibility(key,hidden)};
    const server=remote?new RemoteDashboardService({baseDir:root,...providers}):new LocalDashboardService({baseDir:root,title:"Fixture",configName:"local.json",defaultPort:0,providers}); servers.push(server);
    if(remote)server.config.server_port=0;
    const {url}=await server.start();
    const post=(body,headers={})=>fetch(url+"/api/usage/profile-visibility",{method:"POST",headers:{origin:url,"content-type":"application/json",...headers},body:JSON.stringify(body)});
    const request={profileKey:`codex:${id}`,hidden:true};
    expect((await post(request,{origin:"https://cross-origin.invalid"})).status).toBe(403);
    expect((await post({...request,hidden:"true"})).status).toBe(400);
    expect((await post(request,{"content-type":"text/plain"})).status).toBe(415);
    if(remote)expect((await post(request,{"cf-connecting-ip":"203.0.113.10"})).status).toBe(401);
    expect((await post(request)).status).toBe(200);
    const summary=await fetch(url+"/api/usage").then(response=>response.json());
    expect(summary.limits.find(limit=>limit.limitId===`codex:${id}`).profile.hidden).toBe(true);
    expect((await post({...request,hidden:false})).status).toBe(200);
  });
});
