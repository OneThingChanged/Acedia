import { useEffect, useRef, useState } from "react";
import { invoke } from "../platform/runtime";
import type { ChatBlock } from "../platform/ipcContract";
import { useAppLanguage } from "../lib/appLanguage";
type Worker = {sessionId:string;name:string;path:string;updatedAt:number;model?:string;effort?:string;activity?:string};
export function SubagentMonitor({agentId,sessionId,onClose}:{agentId:string;sessionId?:string;onClose:()=>void}) {
 const {text}=useAppLanguage();
 const [workers,setWorkers]=useState<Worker[]>([]),[selected,setSelected]=useState(""),[blocks,setBlocks]=useState<ChatBlock[]>([]),[error,setError]=useState(""),[truncated,setTruncated]=useState(false),[follow,setFollow]=useState(true),[loading,setLoading]=useState(true);
 const end=useRef<HTMLDivElement>(null);
 useEffect(()=>{let stopped=false;let timer:ReturnType<typeof setTimeout>;async function poll(){try{const rows=await invoke("subagent_list",{id:agentId,sessionId});if(!stopped){setWorkers(rows);setSelected(s=>rows.some(r=>r.sessionId===s)?s:rows[0]?.sessionId||"");setError("");}}catch(e){if(!stopped)setError(String(e));}finally{if(!stopped){setLoading(false);timer=setTimeout(poll,5000);}}}void poll();return()=>{stopped=true;clearTimeout(timer);};},[agentId,sessionId]);
 const worker=workers.find(w=>w.sessionId===selected);
 useEffect(()=>{setBlocks([]);setTruncated(false);if(!worker)return;let stopped=false;let timer:ReturnType<typeof setTimeout>;async function poll(){try{const result=await invoke("read_chat_transcript",{tool:"codex",path:worker!.path});if(!stopped){setBlocks(result.blocks);setTruncated(result.truncated);setError(result.missing?text("로그 파일이 없습니다.","Log file is missing."):"");}}catch(e){if(!stopped)setError(String(e));}finally{if(!stopped)timer=setTimeout(poll,2000);}}void poll();return()=>{stopped=true;clearTimeout(timer);};},[worker?.path,text]);
 useEffect(()=>{if(follow)end.current?.scrollIntoView({block:"end"});},[blocks,follow]);
 return <aside className="subagent-monitor" aria-label={text("작업자 로그","Worker logs")}>
  <header><strong>{text("작업자","Workers")}</strong><button onClick={onClose}>{text("닫기","Close")}</button></header>
  <p>{text("읽기 전용 · 직접 하위 작업자 · 목록 5초 / 로그 2초 갱신","Read only · Direct workers · List 5s / logs 2s")}</p>
  {error&&<p role="alert">{error}</p>}
  {!workers.length?<p>{loading?text("작업자 확인 중…","Loading workers…"):text("이 세션에 연결된 작업자가 없습니다.","No workers linked to this session.")}</p>:<>
   <select aria-label={text("작업자 선택","Select worker")} value={selected} onChange={e=>setSelected(e.target.value)}>{workers.map(w=><option key={w.sessionId} value={w.sessionId}>{w.name} · {w.sessionId.slice(0,8)}</option>)}</select>
   <small>{worker?.sessionId} · {text("마지막 기록","Last record")} {worker&&new Date(worker.updatedAt).toLocaleTimeString()}</small>
   <small>{worker?.model || text("모델 미확인","Model unknown")} · {worker?.effort || text("Effort 미확인","Effort unknown")} · {worker?.activity === "task_started" ? text("턴 시작 기록됨","Turn started") : worker?.activity === "task_complete" ? text("턴 완료","Turn completed") : worker?.activity === "turn_aborted" ? text("턴 중단","Turn aborted") : text("상태 미확인","State unknown")}</small>
   <label><input type="checkbox" checked={follow} onChange={e=>setFollow(e.target.checked)}/>{text("최신 로그 따라가기","Follow latest logs")}</label>
   {truncated&&<small>{text("최근 로그 일부만 표시합니다.","Showing the most recent portion of the log.")}</small>}
   <div className="subagent-log">{blocks.map((b,i)=><article key={i}><strong>{b.role} · {b.name||b.kind}</strong><pre>{b.text||b.output||b.summary||(b.input?typeof b.input==="string"?b.input:JSON.stringify(b.input,null,2):text("이미지 또는 텍스트 없는 기록","Image or non-text record"))}</pre></article>)}<div ref={end}/></div>
  </>}
 </aside>;
}
