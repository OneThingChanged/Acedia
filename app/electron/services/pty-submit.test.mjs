import { describe, expect, it, vi } from "vitest";
import {
  preparePtySubmission,
  PTY_SUBMIT_DELAY_MS,
  PTY_SUBMIT_QUIET_MS,
  PTY_SUBMIT_TIMEOUT_MS,
  submitPtyMessage,
} from "./pty-submit.mjs";

describe("PTY message submission", () => {
  it("keeps a single-line message as ordinary terminal input", () => {
    expect(preparePtySubmission("상태 확인해줘")).toBe("상태 확인해줘");
  });

  it("wraps an image-tagged multiline message as one bracketed paste", () => {
    const message = [
      "이 이미지 확인해줘",
      "",
      "첨부 이미지:",
      '"C:\\Users\\tester\\App Data\\remote-attachments\\한글 이미지.png"',
      '"C:\\Users\\tester\\App Data\\remote-attachments\\second.jpg"',
    ].join("\r\n");

    expect(preparePtySubmission(message)).toBe(
      "\x1b[200~이 이미지 확인해줘\r\r첨부 이미지:\r"
      + '"C:\\Users\\tester\\App Data\\remote-attachments\\한글 이미지.png"\r'
      + '"C:\\Users\\tester\\App Data\\remote-attachments\\second.jpg"\x1b[201~',
    );
  });

  it("closes the paste before sending Enter as a separate write", async () => {
    const writes = [];
    let clock = 0;
    const wait = vi.fn(async ms => { clock += ms; });
    const accepted = await submitPtyMessage({
      ptyProcess: { write: (value) => writes.push(value) },
      message: "설명\n\n첨부 이미지:\n\"C:\\capture.png\"",
      wait,
      now: () => clock,
    });

    expect(accepted).toBe(true);
    expect(wait).toHaveBeenCalledWith(PTY_SUBMIT_DELAY_MS);
    expect(writes).toEqual([
      "\x1b[200~설명\r\r첨부 이미지:\r\"C:\\capture.png\"\x1b[201~",
      "\r",
    ]);
  });

  it("rejects a stale target before writing anything", async () => {
    const write = vi.fn();
    const accepted = await submitPtyMessage({
      ptyProcess: { write },
      message: "설명\n첨부 이미지",
      isCurrent: () => false,
      wait: async () => {},
    });

    expect(accepted).toBe(false);
    expect(write).not.toHaveBeenCalled();
  });
  it("crosses the Windows paste-burst Enter suppression window", async () => {
    let clock = 0, pasteAt = 0, submitted = 0, insertedNewlines = 0;
    await submitPtyMessage({
      ptyProcess: { write(value) {
        if (value !== '\r') pasteAt = clock;
        else if (clock - pasteAt <= 120) insertedNewlines++;
        else submitted++;
      } },
      message: '이미지 확인\n첨부 이미지:\n"C:\\test image.png"',
      wait: async ms => { clock += ms; }, now: () => clock,
    });
    expect(submitted).toBe(1);
    expect(insertedNewlines).toBe(0);
  });
  it("waits for delayed ConPTY output to settle before sending exactly one Enter", async () => {
    let clock = 0, listener;
    const writes = [], dispose = vi.fn();
    const wait = vi.fn(async ms => {
      clock += ms;
      if (clock === PTY_SUBMIT_DELAY_MS) listener('late paste render');
    });
    await submitPtyMessage({
      ptyProcess: { write: value => writes.push({value,at:clock}), onData: fn => { listener = fn; return {dispose}; } },
      message: '첨부 이미지:\n"C:\\한글 이미지.png"', wait, now: () => clock,
    });
    expect(writes.filter(w => w.value === '\r')).toEqual([{value:'\r',at:PTY_SUBMIT_DELAY_MS + PTY_SUBMIT_QUIET_MS}]);
    expect(dispose).toHaveBeenCalledOnce();
  });
  it("keeps post-paste target loss uncertain instead of allowing the text to be replayed", async () => {
    let current = true, clock = 0;
    const write = vi.fn();
    await expect(submitPtyMessage({
      ptyProcess: {write}, message:'hello', isCurrent: () => current,
      wait: async ms => {clock += ms; current = false;}, now: () => clock,
    })).rejects.toThrow('outcome unknown');
    expect(write).toHaveBeenCalledExactlyOnceWith('hello');
  });
  it("stops an unsettled paste without blindly retrying Enter", async () => {
    let clock = 0, listener;
    const write = vi.fn(), dispose = vi.fn();
    await expect(submitPtyMessage({
      ptyProcess:{write,onData:fn=>{listener=fn;return {dispose};}}, message:'image\npath',
      wait:async ms=>{clock+=ms;listener('still rendering');},now:()=>clock,
    })).rejects.toThrow('outcome unknown');
    expect(clock).toBe(PTY_SUBMIT_TIMEOUT_MS);
    expect(write).toHaveBeenCalledTimes(1);
    expect(dispose).toHaveBeenCalledOnce();
  });
  it("does not interleave two composer messages on one PTY", async () => {
    let release, clock = 0;
    const write = vi.fn(), ptyProcess = {write};
    const first = submitPtyMessage({ptyProcess,message:'first',now:()=>clock,
      wait:ms=>new Promise(resolve=>{release=()=>{clock+=ms;resolve();};})});
    expect(await submitPtyMessage({ptyProcess,message:'second'})).toBe(false);
    release(); expect(await first).toBe(true);
    expect(write.mock.calls).toEqual([['first'],['\r']]);
  });
  it("does not mistake a delayed or nonresponsive terminal for a settled paste", async () => {
    let clock=0;
    const write=vi.fn();
    await expect(submitPtyMessage({ptyProcess:{write,onData:()=>({dispose(){}})},message:'image\npath',
      now:()=>clock,wait:async ms=>{clock+=ms;},
    })).rejects.toThrow('outcome unknown');
    expect(clock).toBe(PTY_SUBMIT_TIMEOUT_MS);
    expect(write).toHaveBeenCalledTimes(1);
  });
});
