import fs from 'fs';
// ---- DOM + storage stubs ----
function el(){return{className:'',id:'',innerHTML:'',textContent:'',style:{},children:[],
  classList:{add(){},remove(){},toggle(){},contains(){return false}},
  appendChild(c){this.children.push(c);return c},addEventListener(){},setAttribute(){},
  querySelector(sel){ this._q=this._q||{}; if(!this._q[sel]) this._q[sel]=el(); return this._q[sel] },querySelectorAll(){return[]},focus(){},scrollTop:0,scrollHeight:0}}
const store = {
  painterPlusTeam: JSON.stringify([
    {id:'gahonsh',name:'Gahonsh',role:'head',phone:'+91 8825183628',email:'gahonsh@gmail.com',address:'Upar Balalong, Arki, Khunti, Jharkhand – 835225',startYear:'2015',title:'Founder',tagline:'Quality first'},
    {id:'ravi',name:'Ravi Kumar',role:'painter',phone:'+91 9000000000',startYear:'2019'}
  ]),
  painterPlusWorkLog: JSON.stringify({
    '2026-11-18': {date:'2026-11-18',crew:'ravi',project:'Sharma House',status:'submitted',entries:[{sqft:420},{sqft:180}]},
    '2026-11-19': {date:'2026-11-19',crew:'ravi',project:'Sharma House',status:'open',entries:[{sqft:300}]},
    '2026-11-17': {date:'2026-11-17',crew:'gahonsh',project:'Office',status:'submitted',entries:[{sqft:900}]}
  }),
  painterPlusProjects: JSON.stringify([{title:'Modern Living Room'},{title:'Exterior Facade'}]),
  painterPlusReviews: JSON.stringify([{score:5},{score:4},{score:5}]),
  painterPlusERP: JSON.stringify({projects:[{id:'p1',name:'Sharma House',status:'active',crew:'ravi'}],bills:{},approvals:{}})
};
global.localStorage = {getItem:k=>store[k]??null,setItem:(k,v)=>{store[k]=String(v)},removeItem:k=>{delete store[k]}};
global.location = {pathname:'/index.html', search:''};
global.window = global;
global.document = {readyState:'complete',head:el(),body:el(),getElementById:()=>null,createElement:()=>el(),addEventListener(){}};
global.addEventListener = ()=>{};

// fake team module (mirrors js/team.js contract)
global.PPTeam = {
  PASSCODE_SHA256:'x', passcodeDigest:(p)=>p==='good'?'x':'y',
  unlockHead:(p)=>p==='good',
  list:()=>JSON.parse(store.painterPlusTeam),
  roleOf:(r)=>({label:(r||'painter')[0].toUpperCase()+(r||'painter').slice(1)}),
  ownerDefaults:()=>JSON.parse(store.painterPlusTeam)[0]
};
global.PPWorkLog = { listDays:()=>Object.keys(JSON.parse(store.painterPlusWorkLog)).sort().reverse().map(k=>JSON.parse(store.painterPlusWorkLog)[k]) };
global.PPERP = { listProjects:()=>JSON.parse(store.painterPlusErp||'{"projects":[]}').projects,
  reportByPainter:()=>[{key:'ravi',approvedTotal:21500,pendingLabour:3000,invoicedTotal:15000}] };

eval(fs.readFileSync(new URL('../js/smart-bot.js', import.meta.url),'utf8'));
const B = global.PPBot;
console.log('loaded', B.version);

let fail = 0;
function check(name, cond, extra){ if(!cond){fail++; console.log('FAIL', name, extra||'')} else console.log('PASS', name); }

// --- client mode ---
const svc = B.ask('what services do you offer');
check('services lists interior', /Interior/i.test(svc.text), svc.text.slice(0,60));
const war = B.ask('वारंटी कितनी है');
check('hindi warranty answer', /5/.test(war.text) && /वारंटी|साल/.test(war.text), war.text.slice(0,60));
const con = B.ask('contact number');
check('contact has phone', /8825/.test(con.text), con.text.slice(0,60));
const tm = B.ask('kitne log team me hain');
check('team count = 2', /2/.test(tm.text), tm.text);
const pv = B.ask('portfolio dikhao');
check('portfolio count 2', /2/.test(pv.text), pv.text.slice(0,80));
const rv = B.ask('reviews rating');
check('reviews avg 4.7', /4\.7/.test(rv.text), rv.text);
const pr = B.ask('price kitna hai');
check('pricing does not invent numbers', !/₹\d/.test(pr.text), pr.text.slice(0,80));
const gp = B.ask('kya aap gold paint karte hain special');
check('unknown -> gap', !!gp.escalated, gp.text.slice(0,50));

// --- painter mode ---
B._internals.setMode('painter');
B._internals.handlePainter('wrongcode', false);
check('bad code rejected', /not found|नहीं मिला/.test(B._internals.lastBotMessage()));
B._internals.handlePainter('ravi', false);
check('code found asks passcode', /passcode|पासकोड/i.test(B._internals.lastBotMessage()));
B._internals.handlePainter('badpass', false);
check('wrong passcode rejected', /Wrong passcode|गलत/.test(B._internals.lastBotMessage()));
B._internals.handlePainter('good', false);
const sum = B._internals.lastBotMessage();
check('unlocked summary shows name', /Ravi/.test(sum), sum.slice(0,80));
check('summary shows sqft 900', /900/.test(sum), sum.slice(0,160));
B._internals.handlePainter('my earnings', false);
check('earnings gated and shown', /21,500|21500/.test(B._internals.lastBotMessage()), B._internals.lastBotMessage().slice(0,80));
B._internals.handlePainter('pending', false);
check('pending lists open day', /2026-11-19/.test(B._internals.lastBotMessage()), B._internals.lastBotMessage().slice(0,80));
B._internals.handlePainter('logout', false);
check('logout returns to client', B._internals.session().mode === 'client');

// --- no-passcode leak check ---
B._internals.setMode('painter');
B._internals.handlePainter('ravi', false);
B._internals.handlePainter('my earnings', false);
const leak = B._internals.lastBotMessage();
check('no earnings before passcode', !/21,500/.test(leak), leak.slice(0,80));

console.log('\nfails:', fail);
