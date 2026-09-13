import { describe, it, expect } from 'vitest';
import { baselineCost, costTimeline, modelUsage } from './pricing.mjs';
const event = { provider: 'codex', model: 'gpt-6-astra', input: 1000, cacheRead: 9000, output: 80, reasoning: 20 };
describe('standard short-context comparison cost', () => {
  it('prices cached tokens separately and reasoning exactly once', () => {
    expect(baselineCost(event)).toBeCloseTo(0.024);
    expect(baselineCost({...event,model:'gpt-5.6-luna'})).toBeCloseTo(0.0005);
    expect(baselineCost({...event,fast:true})).toBe(baselineCost(event));
  });
  it('does not turn unsupported models or missing breakdowns into free usage', () => {
    for (const patch of [{model:'unknown'}, {provider:'claude'}, {input:null}, {cacheRead:null}, {reasoning:null}, {output:-1}]) expect(baselineCost({...event,...patch})).toBeNull();
    expect(baselineCost({...event,input:0,cacheRead:0,output:0,reasoning:0})).toBe(0);
  });
  it('rolls up all requests, keeps dimensions and reports unpriced coverage', () => {
    const row = {accountId:'a',employeeId:'e',deviceId:'d',occurredAt:Date.parse('2026-09-12T16:00:00Z'),json:JSON.stringify(event)};
    const result = costTimeline(Array.from({length:501},()=>row));
    expect(result[0].priced).toBe(501);
    expect(result[0].usd).toBeCloseTo(501*0.024);
    expect(result[0].day).toBe(Date.parse('2026-09-13T00:00:00Z'));
    const split = costTimeline([row,{...row,employeeId:'other'}, {...row,json:JSON.stringify({...event,model:'unknown'})}]);
    expect(split).toHaveLength(2); expect(split[0].unpriced).toBe(1); expect(split[1].employeeId).toBe('other');
  });
});

it('groups provider/model/effort without merging unknown effort and counts every request',()=>{
 const row={occurredAt:Date.parse('2026-09-13T00:00:00Z'),employeeId:'e',accountId:'a',provider:'codex',total:10100,json:JSON.stringify({...event,effort:'low'})};
 const result=modelUsage([...Array(501).fill(row),{...row,json:JSON.stringify({...event,effort:'high'})},{...row,json:'{}'},{...row,employeeId:'other'}]);
 expect(result).toHaveLength(4);expect(result[0]).toMatchObject({requests:501,tokens:5060100,priced:501,unpriced:0,effort:'low'});expect(result[0].usd).toBeCloseTo(501*.024);
 expect(result[2]).toMatchObject({model:null,effort:null,unpriced:1,usd:0});
});
