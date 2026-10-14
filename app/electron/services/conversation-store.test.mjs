import { afterEach, describe, expect, it, vi } from "vitest";
import { promises as fsPromises } from "node:fs";
import os from "node:os";
import path from "node:path";
import { ConversationStoreManager } from "./conversation-store.mjs";

const cleanup = [];
const lineTool = payload => JSON.stringify({type:'response_item',payload});

async function tempRoot() {
  const root = await fsPromises.mkdtemp(path.join(os.tmpdir(), "multiagent-conversations-"));
  cleanup.push(root);
  return root;
}

function codexLine(role, text) {
  return JSON.stringify({
    type: "response_item",
    payload: {
      type: "message",
      role,
      content: [{ type: role === "user" ? "input_text" : "output_text", text }],
    },
  });
}

afterEach(async () => {
  while (cleanup.length) {
    const root = cleanup.pop();
    if (path.dirname(root) !== os.tmpdir() || !path.basename(root).startsWith("multiagent-conversations-")) throw Error("Unsafe test cleanup path");
    await fsPromises.rm(root, { recursive: true });
  }
});

describe("ConversationStoreManager", () => {
  it('pages whole replies, transmits compact work, and polls only new records without repeating file checks', async () => {
    const root = await tempRoot();
    const manager = new ConversationStoreManager({configDir:path.join(root,'config'),defaultRoot:path.join(root,'store')});
    const input = {agentId:'paged',sessionId:'one',provider:'codex',projectPath:root,transcriptPath:path.join(root,'session.jsonl')};
    try {
      await fsPromises.writeFile(path.join(root,'latest.md'),'guide');
      const lines=[];
      for(let i=0;i<30;i++) {
        lines.push(codexLine('user','question '+i));
        for(let j=0;j<12;j++) {
          lines.push(lineTool({type:'function_call',call_id:`call-${i}-${j}`,name:'exec_command',arguments:JSON.stringify({cmd:'echo '+ 'x'.repeat(5000)})}));
          lines.push(lineTool({type:'function_call_output',call_id:`call-${i}-${j}`,output:'result '+ 'x'.repeat(4000)}));
        }
        lines.push(codexLine('assistant','complete answer '+i+(i===29?' [guide](latest.md)':'')));
      }
      await fsPromises.writeFile(input.transcriptPath,lines.join('\n')+'\n'); await manager.ingestTranscript(input);
      const legacy=await manager.listBlocks({...input,limit:400});
      const page=await manager.listBlocks({...input,turnLimit:5});
      expect(page.blocks[0].text).toBe('question 25'); expect(page.blocks.at(-1).text).toContain('complete answer 29');
      expect(page.blocks).toHaveLength(130); expect(page.hasOlder).toBe(true);
      expect(Buffer.byteLength(JSON.stringify(page))).toBeLessThan(Buffer.byteLength(JSON.stringify(legacy))/5);
      const older=await manager.listBlocks({...input,turnLimit:5,beforeSequence:page.firstSequence,conversationId:page.conversationId});
      expect(older.blocks[0].text).toBe('question 20'); expect(older.blocks.at(-1).text).toBe('complete answer 24');
      expect(older.artifacts).toEqual([]);
      const sequences=page.blocks.filter(block=>block.deferred).slice(0,2).map(block=>block.sequence);
      const details=await manager.readBlockDetails({...input,conversationId:page.conversationId,sequences});
      expect(details.blocks[1].output).toContain('result');
      expect((await manager.readBlockDetails({...input,agentId:'other',conversationId:page.conversationId,sequences})).blocks).toEqual([]);
      const spy=vi.spyOn(fsPromises,'stat');
      const poll=await manager.listBlocks({...input,turnLimit:5,afterSequence:page.lastSequence,conversationId:page.conversationId});
      expect(poll).toMatchObject({pageMode:'delta',blocks:[],artifacts:[],lastSequence:page.lastSequence});
      expect(spy).not.toHaveBeenCalled(); spy.mockRestore();
      await fsPromises.appendFile(input.transcriptPath,codexLine('user','new question')+'\n'+codexLine('assistant','new answer')+'\n');
      await manager.ingestTranscript(input);
      const delta=await manager.listBlocks({...input,turnLimit:5,afterSequence:page.lastSequence,conversationId:page.conversationId});
      expect(delta.blocks.map(block=>block.text)).toEqual(['new question','new answer']);
      const reset=await manager.listBlocks({...input,turnLimit:5,afterSequence:delta.lastSequence,conversationId:'old-conversation'});
      expect(reset.pageMode).toBe('initial'); expect(reset.blocks.at(-1).text).toBe('new answer');
    } finally { vi.restoreAllMocks(); manager.close(); }
  });

  it('does not split a text message from attached image blocks at a page boundary', async () => {
    const root=await tempRoot(), manager=new ConversationStoreManager({configDir:path.join(root,'config'),defaultRoot:path.join(root,'store')});
    const input={agentId:'pictures',sessionId:'one',provider:'codex',transcriptPath:path.join(root,'session.jsonl')};
    try {
      const lines=[]; for(let i=0;i<8;i++){
        lines.push(JSON.stringify({type:'response_item',payload:{type:'message',role:'user',content:[{type:'input_text',text:'image question '+i},
          {type:'input_image',image_url:'data:image/png;base64,YQ=='},{type:'input_image',image_url:'data:image/png;base64,Yg=='}]}}));
        lines.push(codexLine('assistant','image answer '+i));
      }
      await fsPromises.writeFile(input.transcriptPath,lines.join('\n')+'\n'); await manager.ingestTranscript(input);
      const page=await manager.listBlocks({...input,turnLimit:5});
      expect(page.blocks[0].text).toContain('image question 3'); expect(page.blocks.at(-1).text).toBe('image answer 7');
      const older=await manager.listBlocks({...input,turnLimit:5,beforeSequence:page.firstSequence});
      expect(older.blocks[0].text).toContain('image question 0'); expect(older.blocks.at(-1).text).toBe('image answer 2'); expect(older.hasOlder).toBe(false);
    } finally { manager.close(); }
  });
  it("deduplicates asynchronous file checks and invalidates a cached miss after a write", async () => {
    const root = await tempRoot();
    const manager = new ConversationStoreManager({ configDir:path.join(root,"config"), defaultRoot:path.join(root,"store") });
    const input = { agentId:"stats", sessionId:"one", provider:"codex", projectPath:root, transcriptPath:path.join(root,"session.jsonl") };
    const target = path.join(root,"created.md");
    try {
      await fsPromises.writeFile(input.transcriptPath, [codexLine("user","Review"), ...Array.from({length:40},()=>codexLine("assistant","`created.md`"))].join("\n")+"\n");
      await manager.store.ingestTranscript(input);
      const spy = vi.spyOn(fsPromises,"stat");
      const first = await manager.listBlocks(input);
      expect(first.artifacts).toEqual([]);
      await manager.listBlocks(input);
      expect(spy.mock.calls.filter(([file])=>file===target)).toHaveLength(1);
      spy.mockRestore();
      await fsPromises.writeFile(target,"created");
      const tool = payload=>JSON.stringify({type:"response_item",payload});
      await fsPromises.appendFile(input.transcriptPath,[tool({type:"function_call",name:"Write",arguments:JSON.stringify({file_path:"created.md",content:"created"}),call_id:"write"}),
        tool({type:"function_call_output",output:"Done",call_id:"write"}),codexLine("assistant","[created](created.md)")].join("\n")+"\n");
      await manager.store.ingestTranscript(input);
      const updated = await manager.listBlocks(input);
      expect(updated.artifacts.some(file=>file.path===target && file.usage==="output")).toBe(true);
    } finally { vi.restoreAllMocks(); manager.close(); }
  });
  it("rebuilds per-block file associations for stored history, older pages and more than 100 files", async () => {
    const root = await tempRoot();
    const config = { configDir: path.join(root, "config"), defaultRoot: path.join(root, "store") };
    let manager = new ConversationStoreManager(config);
    try {
      const names = ["guide.html", "result.mp4", ...Array.from({ length: 105 }, (_, i) => `reference-${i}.ts`)];
      await Promise.all(names.map(name => fsPromises.writeFile(path.join(root, name), "contents")));
      const input = { agentId: "files", sessionId: "one", provider: "codex", projectPath: root, transcriptPath: path.join(root, "session.jsonl") };
      const tool = (payload) => JSON.stringify({ type: "response_item", payload });
      const records = [codexLine("user", "Read the existing guide"), codexLine("assistant", "[guide](guide.html)"),
        codexLine("user", "Create a movie"), tool({ type: "function_call", name: "Write", arguments: '{"file_path":"result.mp4"}', call_id: "movie" }),
        tool({ type: "function_call_output", output: "Done", call_id: "movie" }), codexLine("assistant", "[movie](result.mp4)")];
      await fsPromises.writeFile(input.transcriptPath, records.join("\n") + "\n");
      await manager.store.ingestTranscript(input);
      manager.close();
      manager = new ConversationStoreManager(config);
      const page = await manager.store.listBlocks({ ...input, limit: 3 });
      expect(page.artifacts.some(file => file.usage === "output" && file.path === path.join(root, "result.mp4"))).toBe(true);
      expect(page.artifacts.some(file => file.path.endsWith("guide.html"))).toBe(false);
      const older = await manager.store.listBlocks({ ...input, beforeSequence: page.firstSequence, limit: 3 });
      expect(older.artifacts).toEqual([expect.objectContaining({ path: path.join(root, "guide.html"), usage: "reference", sourceSequence: older.blocks[1].sequence })]);
      expect((await manager.store.listBlocks({ ...input, agentId: "other" })).artifacts).toEqual([]);
      await fsPromises.appendFile(input.transcriptPath, codexLine("user", "Review the source files") + "\n" + codexLine("assistant", names.slice(2).map(name => `\`${name}\``).join("\n")) + "\n");
      await manager.store.ingestTranscript(input);
      const last = await manager.store.listBlocks({ ...input, limit: 2 });
      expect(last.artifacts).toHaveLength(105);
      expect(last.artifacts.every(file => file.usage === "reference" && file.sourceSequence === last.blocks[1].sequence)).toBe(true);
    } finally { manager.close(); }
  });
  it("recovers attachments from already indexed source offsets without bloating regular history", async () => {
    const root = await tempRoot();
    const manager = new ConversationStoreManager({ configDir: path.join(root, "config"), defaultRoot: path.join(root, "store") });
    try {
      const transcriptPath = path.join(root, "session.jsonl");
      const input = { agentId: "image-owner", sessionId: "images", provider: "codex", transcriptPath };
      const bitmap = "data:image/png;base64,YQ==";
      const text = "[Image #1] 채팅 UX 확인해줘";
      const record = JSON.stringify({ type: "response_item", payload: { type: "message", role: "user", content: [{ type: "input_text", text }, { type: "input_image", image_url: bitmap }] } });
      manager.store.recordUserMessage({ ...input, text });
      await fsPromises.writeFile(transcriptPath, `${codexLine("assistant", "이전 답변")}\n${record}\n`);
      await manager.store.ingestTranscript(input);
      const page = await manager.store.listBlocks(input);
      const sequence = page.blocks.find(block => block.role === "user").sequence;
      expect(JSON.stringify(page)).not.toContain("base64");
      expect(await manager.readImages({ agentId: input.agentId, sequence })).toEqual([{ dataUrl: bitmap }]);
      expect(await manager.readImages({ agentId: "another-agent", sequence })).toEqual([]);
      expect(await manager.readImages({ agentId: input.agentId, sequence: page.blocks.find(block => block.role === "assistant").sequence })).toEqual([]);
      await fsPromises.writeFile(transcriptPath, `${codexLine("user", "rewritten")}\n`);
      expect(await manager.readImages({ agentId: input.agentId, sequence })).toEqual([]);
      await manager.store.ingestTranscript(input);
      expect(await manager.readImages({ agentId: input.agentId, sequence })).toEqual([]);
    } finally { manager.close(); }
  });
  it("recovers each Claude image from a multi-part user message", async () => {
    const root = await tempRoot();
    const manager = new ConversationStoreManager({ configDir: path.join(root, "config"), defaultRoot: path.join(root, "store") });
    try {
      const input = { agentId: "claude-owner", sessionId: "images", provider: "claude", transcriptPath: path.join(root, "claude.jsonl") };
      await fsPromises.writeFile(input.transcriptPath, JSON.stringify({ type: "user", message: { content: [{ type: "text", text: "두 이미지 확인해줘" },
        { type: "image", source: { type: "base64", media_type: "image/png", data: "YQ==" } },
        { type: "text", text: "그리고 두 번째" },
        { type: "image", source: { type: "base64", media_type: "image/jpeg", data: "Yg==" } }] } }) + "\n");
      await manager.store.ingestTranscript(input);
      const page = await manager.store.listBlocks(input);
      const images = page.blocks.filter(block => block.kind === "image");
      expect(images).toHaveLength(2);
      expect(await manager.readImages({ agentId: input.agentId, sequence: images[0].sequence })).toEqual([{ dataUrl: "data:image/png;base64,YQ==" }]);
      expect(await manager.readImages({ agentId: input.agentId, sequence: images[1].sequence })).toEqual([{ dataUrl: "data:image/jpeg;base64,Yg==" }]);
      expect(await manager.readImages({ agentId: input.agentId, sequence: page.blocks[0].sequence })).toEqual([]);
    } finally { manager.close(); }
  });
  it("persists one agent conversation incrementally without duplicating composer input", async () => {
    const root = await tempRoot();
    const configDir = path.join(root, "config");
    const defaultRoot = path.join(root, "local", "conversation-store");
    const transcript = path.join(root, "session.jsonl");
    const manager = new ConversationStoreManager({ configDir, defaultRoot });
    const input = {
      agentId: "agent-a",
      sessionId: "session-a",
      provider: "codex",
      transcriptPath: transcript,
      projectPath: root,
      title: "Agent A",
    };

    manager.store.recordUserMessage({ ...input, text: "hello" });
    await fsPromises.writeFile(
      transcript,
      `${codexLine("user", "hello")}\n${codexLine("assistant", "world")}\n`,
      "utf8",
    );
    await manager.store.ingestTranscript(input);
    await manager.store.ingestTranscript(input);

    let page = await manager.store.listBlocks({
      agentId: input.agentId,
      sessionId: input.sessionId,
      provider: input.provider,
      limit: 10,
    });
    expect(page.blocks.map((block) => block.text)).toEqual(["hello", "world"]);
    expect(page.total).toBe(2);

    await fsPromises.appendFile(
      transcript,
      `${codexLine("user", "again")}\n${codexLine("assistant", "done")}\n`,
      "utf8",
    );
    await manager.store.ingestTranscript(input);
    page = await manager.store.listBlocks({
      agentId: input.agentId,
      sessionId: input.sessionId,
      provider: input.provider,
      limit: 2,
    });
    expect(page.blocks.map((block) => block.text)).toEqual(["again", "done"]);
    expect(page.hasOlder).toBe(true);
    expect(page.total).toBe(4);

    const older = await manager.store.listBlocks({
      agentId: input.agentId,
      sessionId: input.sessionId,
      provider: input.provider,
      beforeSequence: page.firstSequence,
      limit: 10,
    });
    expect(older.blocks.map((block) => block.text)).toEqual(["hello", "world"]);
    manager.close();

    const reopened = new ConversationStoreManager({ configDir, defaultRoot });
    expect((await reopened.store.listBlocks({
      agentId: input.agentId,
      sessionId: input.sessionId,
      provider: input.provider,
      limit: 10,
    })).blocks.map((block) => block.text)).toEqual(["hello", "world", "again", "done"]);
    reopened.close();
  });

  it("isolates agents and safely copies the active store to a configured path", async () => {
    const root = await tempRoot();
    const configDir = path.join(root, "config");
    const defaultRoot = path.join(root, "local", "conversation-store");
    const customRoot = path.join(root, "custom", "archive");
    const manager = new ConversationStoreManager({ configDir, defaultRoot });

    manager.store.recordUserMessage({
      agentId: "agent-a",
      sessionId: "shared-provider-id",
      provider: "codex",
      text: "only a",
    });
    manager.store.recordUserMessage({
      agentId: "agent-b",
      sessionId: "shared-provider-id",
      provider: "codex",
      text: "only b",
    });
    expect((await manager.store.listBlocks({
      agentId: "agent-a",
      sessionId: "shared-provider-id",
      provider: "codex",
    })).blocks.map((block) => block.text)).toEqual(["only a"]);
    expect((await manager.store.listBlocks({
      agentId: "agent-b",
      sessionId: "shared-provider-id",
      provider: "codex",
    })).blocks.map((block) => block.text)).toEqual(["only b"]);

    const moved = await manager.setRoot(customRoot);
    expect(moved.custom).toBe(true);
    expect(path.resolve(moved.path)).toBe(path.resolve(customRoot));
    expect((await manager.store.listBlocks({
      agentId: "agent-a",
      sessionId: "shared-provider-id",
      provider: "codex",
    })).blocks.map((block) => block.text)).toEqual(["only a"]);

    const reset = await manager.setRoot(null);
    expect(reset.custom).toBe(false);
    expect((await manager.store.listBlocks({
      agentId: "agent-b",
      sessionId: "shared-provider-id",
      provider: "codex",
    })).blocks.map((block) => block.text)).toEqual(["only b"]);
    manager.close();
  });

  it("reports a missing custom drive without silently creating an empty default archive", async () => {
    const root = await tempRoot();
    const configDir = path.join(root, "config");
    const defaultRoot = path.join(root, "local", "conversation-store");
    const customRoot = path.join(root, "detached-drive", "archive");
    await fsPromises.mkdir(configDir, { recursive: true });
    await fsPromises.writeFile(
      path.join(configDir, "conversation-store-config.json"),
      JSON.stringify({ version: 1, customRoot }),
      "utf8",
    );

    const manager = new ConversationStoreManager({ configDir, defaultRoot });
    const unavailable = await manager.status();
    expect(unavailable.available).toBe(false);
    expect(unavailable.path).toBe(path.resolve(customRoot));
    await expect(fsPromises.stat(defaultRoot)).rejects.toThrow();

    await fsPromises.mkdir(customRoot, { recursive: true });
    const restored = await manager.setRoot(customRoot);
    expect(restored.available).toBe(true);
    expect(restored.custom).toBe(true);
    manager.close();
  });
});
