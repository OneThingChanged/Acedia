import { afterEach, expect, it, vi } from 'vitest';
import { reviewEntries, createWorkspaceReview } from './workspace-shell.js';
import { setLanguage } from './i18n.js';

afterEach(() => { vi.unstubAllGlobals(); setLanguage('en'); });

it('uses observed unread receipts and questions, never background work as a result', () => {
  const agents = [{id:'a',name:'개발',status:'background'}, {id:'b',name:'질문',status:'question'},
    {id:'c',name:'완료',status:'done'}, {id:'d',name:'이전 완료',status:'done'}];
  const unread = new Map([['c','turn-2']]);
  expect(reviewEntries(agents, unread, x => x.status).map(x => [x.id,x.kind])).toEqual([['b','question'],['c','result']]);
  unread.delete('c');
  expect(reviewEntries(agents, unread, x => x.status).map(x => x.id)).toEqual(['b']);
});

it('opens the requested conversation, preserves unchanged rows and never answers a question', () => {
  class Element {
    constructor(tag) { this.tagName=tag; this.children=[]; this.dataset={}; this.attributes={}; this.listeners={}; this.focus=vi.fn(); }
    append(...items) { this.children.push(...items.flatMap(x => x.tagName === 'fragment' ? x.children : [x])); }
    replaceChildren(...items) { this.children=[]; this.append(...items); }
    setAttribute(k,v) { this.attributes[k]=v; }
    addEventListener(k,v) { this.listeners[k]=v; }
  }
  setLanguage('ko');
  vi.stubGlobal('document',{createElement: tag => new Element(tag),createDocumentFragment: () => new Element('fragment')});
  const mount=new Element('div'), trigger=new Element('button'), open=vi.fn(), beforeOpen=vi.fn();
  let entries=[{id:'q',name:'<img onerror=bad>',projectId:'p',kind:'question'}];
  const view=createWorkspaceReview({mount,trigger,getEntries:()=>entries,projectName:()=> '프로젝트',openSession:open,beforeOpen});
  view.update(); const panel=mount.children[0], list=panel.children[2], first=list.children[0];
  view.update(); expect(list.children[0]).toBe(first);
  trigger.listeners.click(); expect(panel.hidden).toBe(false); expect(beforeOpen).toHaveBeenCalledOnce();
  expect(first.children[1].textContent).toBe('<img onerror=bad>');
  first.listeners.click(); expect(open).toHaveBeenCalledWith('q'); expect(panel.hidden).toBe(true);
  entries=[]; view.update(); expect(list.children[0].textContent).toBe('모두 확인했습니다.');
});
