import 'dotenv/config';
import { resolveUpstream } from './server/utils/gateway-resolver.ts';
import { getPublisher } from './server/utils/queue.ts';
const USER='res_ff7a83e83050', PASS='ed17592f39fdf1a88a9fabc94bafdf28';
const target = { host:'httpbin.org', port:443, isHttp:false };
let ok=0;
for(let i=1;i<=4;i++){
  const t=Date.now();
  const r = await resolveUpstream(USER, PASS, target);
  if(r.ok){ ok++; console.log(`#${i} OK proxyId=${r.proxyId.slice(0,8)} (${Date.now()-t}ms)`); }
  else console.log(`#${i} FAIL ${r.message}`);
}
console.log(`RESULT ok=${ok}/4`);
getPublisher().disconnect(); process.exit(0);
