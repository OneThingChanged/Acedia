import {expect,it,describe} from 'vitest';
import {QuestionResponder} from './question-responder.mjs';
import {claudeQuestionFrame,validateClaudeQuestionAnswers} from './claude-question-responder.mjs';

const input={questions:[
  {question:'어느 범위로 구현할까요?',options:[{label:'A+B+C'},{label:'A+B'}]},
  {question:'기간 기본값은?',options:[{label:'7일'},{label:'30일'}]},
  {question:'백엔드도 변경할까요?',options:[{label:'ComfyUI만'},{label:'둘 다'}]},
]};
function fixture(form=input){
  let index=0,selected=0,active=true,text='',review=false,wrongReview=false;
  const completed=[],checked=new Set(),writes=[];
  const raw=JSON.stringify(form);
  const frame=()=>{
    if(!active)return '❯ Type a message';
    const header=form.questions.map((_,i)=>`${i<index||i===index&&checked.size?'☒':'☐'} Q${i}`).join('  ');
    if(review)return `${header}\nReview your answers\n${form.questions.map((q,i)=>'● '+q.question+'\n  → '+(wrongReview?'wrong':completed[i])).join('\n')}\nReady to submit your answers?\n❯ 1. Submit answers\n  2. Cancel`;
    const q=form.questions[index];
    return `${header}\n${q.question}\n${[...q.options.map(o=>o.label),text||'Type something.'].map((label,i)=>`${selected===i?'❯':' '} ${i+1}. ${q.multiSelect?'['+(checked.has(i)?'✔':' ')+'] ':''}${label}`).join('\n')}\nEnter to select · Tab/Arrow keys to navigate · Esc to cancel`;
  };
  const entry={aiToolId:'claude',process:{write:data=>{
    writes.push(data);
    if(data==='\x1b[B')selected++;
    else if(data==='\x1b[A')selected--;
    else if(data===' ')checked.add(selected);
    else if(data.startsWith('\x1b[200~')){text=data.slice(6,-6);if(form.questions[index].multiSelect)checked.add(selected);}
    else if(data==='\r'&&review)active=false;
    else if(data==='\r'||data==='\x1b[C'){
      const q=form.questions[index];
      completed[index]=(q.multiSelect?[...checked].sort((a,b)=>a-b).map(i=>i===q.options.length?text:q.options[i].label):[selected===q.options.length?text:q.options[selected].label]).join(', ');
      index++;selected=0;text='';checked.clear();
      if(index===form.questions.length){if(index===1&&!q.multiSelect)active=false;else review=true;}
    }
  }}};
  let liveEntry=entry,changed=false;
  const service=new QuestionResponder({entry:()=>liveEntry,current:async()=>({sessionId:'s',question:active?{id:changed?'different':'call',question:raw}:null}),snapshot:frame,wait:async()=>{}});
  return {service,entry,writes,frame,request:{sessionId:'s',questionId:'call'},completed,
    change:()=>{changed=true;},replace:()=>{liveEntry={...entry};},manual:()=>{checked.add(0);},wrong:()=>{wrongReview=true;}};
}
describe('Claude native question answers',()=>{
  it('answers the pictured three-question form with a choice, custom text and final reviewed submission exactly once',async()=>{
    const f=fixture(),request={...f.request,answers:[{id:'claude-0',optionIndex:1},{id:'claude-1',optionIndex:null,text:'최근 14일'},{id:'claude-2',optionIndex:0}]};
    expect(await f.service.answer('a',request)).toEqual({status:'sent'});
    expect(f.completed).toEqual(['A+B','최근 14일','ComfyUI만']);
    expect(f.writes.filter(key=>key==='\r')).toHaveLength(4);
    const count=f.writes.length;expect(await f.service.answer('a',request)).toEqual({status:'sent'});expect(f.writes).toHaveLength(count);
  });
  it('submits checkbox choices and custom text, while supporting the single-question automatic finish',async()=>{
    const f=fixture({questions:[{question:'파일 종류?',multiSelect:true,options:[{label:'Images'},{label:'ZIP'},{label:'Docs'}]}]});
    await f.service.answer('a',{...f.request,answers:[{id:'claude-0',optionIndex:null,optionIndices:[0,2],text:'기타'}]});
    expect(f.completed).toEqual(['Images, Docs, 기타']);expect(f.writes).toContain('\x1b[C');
    const single=fixture({questions:[input.questions[0]]});
    await single.service.answer('a',{...single.request,answers:[{id:'claude-0',optionIndex:0}]});
    expect(single.writes).toEqual(['\r']);
  });
  it('rejects stale calls, control characters, changed checkbox selections and mismatched review answers',async()=>{
    const f=fixture();f.change();
    await expect(f.service.answer('a',{...f.request,answers:[]})).rejects.toThrow('changed');expect(f.writes).toEqual([]);
    const multi={questions:[{question:'Kinds?',multiSelect:true,options:[{label:'A'},{label:'B'}]}]};
    for(const answer of [{optionIndices:[0,0]},{optionIndices:[9]},{optionIndices:[],text:''},{optionIndices:[0],text:'\x1b[B'}]){
      expect(()=>validateClaudeQuestionAnswers(JSON.stringify(multi),[{id:'claude-0',optionIndex:null,...answer}])).toThrow();
    }
    const manual=fixture(multi);manual.manual();
    await expect(manual.service.answer('a',{...manual.request,answers:[{id:'claude-0',optionIndex:null,optionIndices:[0]}]})).rejects.toThrow('edited');expect(manual.writes).toEqual([]);
    const wrong=fixture();wrong.wrong();
    const request={...wrong.request,answers:input.questions.map((_,i)=>({id:`claude-${i}`,optionIndex:0}))};
    await expect(wrong.service.answer('a',request)).rejects.toThrow('review does not match');
    expect(wrong.writes.filter(key=>key==='\r')).toHaveLength(3);
    await expect(wrong.service.answer('a',request)).rejects.toThrow('outcome unknown');
  });
  it('never infers a native form from old transcript text or a regular composer',()=>{
    for(const text of ['Choose?\n1. A\n2. B','Old Review your answers\n❯ Type a message','☐ Q\nChoose?\n❯ 1. A'])expect(claudeQuestionFrame(text)).toBeNull();
  });
});
