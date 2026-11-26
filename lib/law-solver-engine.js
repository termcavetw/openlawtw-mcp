/* 法規求解器 規則引擎 — 每條規則的門檻都對過 openlawtw 語料（2026-09-28 快照）條文原文。
   2026-11-27 接進 openlawtw-mcp 時逐條複核，修正：第 95 條二層建築的其他用途門檻（避難層直上層 400㎡）、
   消防標準第 19 條第 1 項第 6 款與第 28 條第 1 項第 1 款（甲類場所合計面積）、輸入非防火構造但第 69 條要求防火構造時的提醒。 */
const DS='D0070115', EQ='D0070117', FS='D0120029', PV='D0070319';
const TY_STRUCT='桃園市-GL001940', TY_GREEN='桃園市-GL000347', TY_UD='桃園市-GL000485';

const GROUPS=[
 ['A-1','集會表演'],['A-2','運輸場所'],['B-1','娛樂場所'],['B-2','商場百貨'],['B-3','餐飲場所'],['B-4','旅館'],
 ['C-1','特殊廠庫'],['C-2','一般廠庫'],['D-1','健身休閒'],['D-2','文教設施'],['D-3','國小校舍'],['D-4','校舍'],['D-5','補教托育'],
 ['E','宗教殯葬'],['F-1','醫療照護'],['F-2','社會福利'],['F-3','兒童福利'],['F-4','戒護場所'],
 ['G-1','金融證券'],['G-2','辦公場所'],['G-3','店舖診所'],['H-1','宿舍安養'],['H-2','住宅'],['I','危險廠庫']];

const CATS=['構造與防火','防火區劃與內裝','避難逃生','昇降設備','高層建築專章','一般設計','工廠類建築物','停車與防空','無障礙','綠建築與能源','消防設備','桃園地方規定'];

const n0=v=>(v===''||v==null||isNaN(+v))?null:+v;
const fmt=v=>{ if(v==null) return '—'; const r=Math.round(v*100)/100; return r.toLocaleString('en-US'); };
const m2=v=>fmt(v)+' ㎡';
const inG=(g,...l)=>l.some(x=>x.length===1?g[0]===x:g===x);

function context(inp){
  const c={};
  c.F=Math.max(1,n0(inp.F)||1); c.B=Math.max(0,n0(inp.B)||0);
  c.typ=n0(inp.typ)||0;                       // 標準層（最大單層）樓地板面積
  // 混合用途：uses=[{group,floors:'1'|'2-5'|'1,3'}]，未指定的樓層用 group（主要類組）
  c.fg=[]; const uses=Array.isArray(inp.uses)?inp.uses:[];
  const parseF=s=>String(s??'').split(/[,，、]/).flatMap(p=>{const m=p.trim().match(/^(\d+)\s*[-~～至到]\s*(\d+)$/);if(m){const a=[];for(let i=+m[1];i<=+m[2];i++)a.push(i);return a;}return /^\d+$/.test(p.trim())?[+p.trim()]:[];});
  for(const u of uses) for(const f of parseF(u.floors)) if(f>=1&&f<=c.F&&u.group) c.fg[f]=u.group;
  const cnt={}; for(let f=1;f<=c.F;f++) if(c.fg[f]) cnt[c.fg[f]]=(cnt[c.fg[f]]||0)+1;
  c.g=inp.group||Object.entries(cnt).sort((a,b)=>b[1]-a[1])[0]?.[0]||'H-2'; c.cls=c.g[0];
  for(let f=1;f<=c.F;f++) if(!c.fg[f]) c.fg[f]=c.g;
  c.gs=[...new Set(c.fg.slice(1))]; c.mixed=c.gs.length>1;
  c.floorsOf=g=>{const a=[];for(let f=1;f<=c.F;f++) if(c.fg[f]===g) a.push(f);return a;};
  c.anyG=(...l)=>c.gs.some(g=>inG(g,...l)); c.allG=(...l)=>c.gs.every(g=>inG(g,...l));
  c.useTxt=c.mixed?c.gs.map(g=>`${g}（${span(c.floorsOf(g).map(f=>f+'F'))}）`).join('、'):c.g;
  c.site=n0(inp.site);                        // 基地面積
  c.ba=n0(inp.ba)??c.typ;                     // 建築面積
  c.tfa=n0(inp.tfa)??c.typ*c.F;               // 地上總樓地板
  c.per=c.tfa/c.F;                            // 每層平均（分用途面積用）
  c.areaOf=g=>c.per*c.floorsOf(g).length;
  c.b1=c.B>0?(n0(inp.b1)??(c.site?Math.round(c.site*0.8):c.typ)):0; // 地下單層面積
  c.bsum=c.b1*c.B; c.total=c.tfa+c.bsum;
  c.vfaEst=n0(inp.vfa)==null; c.vfa=n0(inp.vfa)??c.tfa;   // 容積樓地板（第 162 條），未填以地上樓地板估
  c.Hest=n0(inp.H)==null; c.H=n0(inp.H)??Math.round((c.F*3.3+0.9)*10)/10;
  c.units=n0(inp.units);
  c.urban=inp.urban!==false; c.zone=inp.zone||'res';
  c.ty=inp.ty===true;                         // 桃園市案子才檢討桃園地方規定
  c.zoneTxt=String(inp.zoneTxt||'');          // 分區／使用地原文（第十四章適用範圍用）
  c.bcr=n0(inp.bcr);
  c.kw=n0(inp.kw);                            // 工廠用電（含電熱）千瓦
  c.ind=inp.ind==='warehouse'?'warehouse':'factory'; // C 類是工廠還是倉庫
  c.high=c.F>=16||(!c.Hest&&c.H>=50);
  c.nearHigh=!c.high&&c.Hest&&c.H>=45;
  // 供公眾使用：依內政部 99.03.03 台內營字第 0990801045 號令「供公眾使用建築物之範圍」逐用途認定（同一建築物多種用途時依各該用途面積認定）
  c.pubList=c.gs.map(g=>({g,...pubOf(g,c)}));
  c.pubAuto=c.pubList.some(p=>p.on===true);
  c.pubUnsure=!c.pubAuto&&c.pubList.some(p=>p.on==='info');
  c.pub=inp.pub==='yes'?true:inp.pub==='no'?false:c.pubAuto;
  c.pubSrc=inp.pub==='yes'||inp.pub==='no'?'輸入':'推定';
  // 第 170 條公共建築物：H-2 看六層以上或五十戶；C 類不在第 170 條（營建署 103.07.14 營署建管字第 1030044357 號書函）；其他先保守視為是
  c.pubBldg=c.gs.some(g=>g==='H-2'?(c.F>=6||(c.units!=null&&c.units>=50)):g[0]==='C'?false:true);
  // §69 是否「應」為防火構造：逐用途檢討（三層以上之任一樓層供該用途，或該用途面積超過門檻）
  const fpOne=g=>{const fl=c.floorsOf(g), cl=g[0], area=c.areaOf(g)+(g===c.g?c.bsum:0), top=Math.max(...fl), s2=fl.includes(2)?c.per:0;
    if(cl==='A') return [true,'A 類全部'];
    if(cl==='B') return [top>=3||area>=3000||s2>=500,'B 類：三層以上之樓層、總樓地板 ≥3,000㎡，或二層部分 ≥500㎡'];
    if(cl==='C') return c.ind==='factory'?[top>=3,'C 類工廠：三層以上之樓層（1,500㎡ 的面積門檻不含工廠）']:[top>=3||area>=1500,'C 類倉庫等：三層以上之樓層或總樓地板 ≥1,500㎡'];
    if(cl==='D'||cl==='E'||cl==='G') return [top>=3||area>=2000,cl+' 類：三層以上之樓層或總樓地板 ≥2,000㎡'];
    if(cl==='F'||cl==='H') return [top>=3||s2>=300,cl+' 類：三層以上之樓層，或二層面積 ≥300㎡'];
    return [true,'I 類依危險品種類另定，先以防火構造檢討'];};
  const fpr=c.gs.map(g=>[g,...fpOne(g)]), hit=fpr.filter(r=>r[1]);
  c.fpNeed=hit.length>0; c.fpWhy=(hit.length?hit:fpr).map(r=>(c.mixed?r[0]+'：':'')+r[2]).join('；');
  c.fp=c.fpNeed||inp.fireproof!==false;
  c.fpConflict=c.fpNeed&&inp.fireproof===false; // 使用者填非防火構造，但第 69 條要求防火構造：以防火構造檢討並提醒
  c.parkClass=g=>inG(g,'H')?{k:2,f:500,ru:150,rn:300}:inG(g,'A','B-1','B-2','B-3','G','D-1')?{k:1,f:300,ru:150,rn:250}:inG(g,'B-4','D-2','E','F-1','F-2')?{k:3,f:500,ru:200,rn:350}:g==='I'?null:{k:4,f:500,ru:250,rn:350};
  c.park=parkCalc(c);
  // 消防設置標準第 12 條場所分類（由使用類組近似對應；實際依場所用途）
  c.fc=g=>inG(g,'A-1','B-1')?{k:'甲',m:1,t:'甲類第 1 目（戲院、歌廳、KTV、酒店等）'}:inG(g,'D-1')?{k:'甲',m:2,t:'甲類第 2 目（保齡球館、健身休閒、遊藝場等）'}:inG(g,'B-4')?{k:'甲',m:3,t:'甲類第 3 目（旅館）'}:inG(g,'B-2')?{k:'甲',m:4,t:'甲類第 4 目（商場、市場）'}:inG(g,'B-3')?{k:'甲',m:5,t:'甲類第 5 目（餐廳、飲食店）'}:inG(g,'F-1','F-2','F-3')?{k:'甲',m:6,t:'甲類第 6 目（醫院、護理、長照、托嬰等）'}
    :inG(g,'A-2')?{k:'乙',m:1,t:'乙類第 1 目（車站）'}:g[0]==='C'?(c.ind==='warehouse'?{k:'乙',m:11,t:'乙類第 11 目（倉庫）'}:{k:'丁',m:0,t:'丁類（工作場所，依危險程度分高、中、低度）'}):g==='I'?{k:'丁',m:1,t:'丁類（高度危險工作場所）'}
    :inG(g,'D-5')?{k:'乙',m:3,t:'乙類第 3 目（補習班；幼兒園為乙類第 12 目）'}:inG(g,'H-2','H-1')?{k:'乙',m:7,t:'乙類第 7 目（集合住宅、寄宿舍；安養機構屬甲類第 6 目）'}:{k:'乙',m:0,t:'乙類'};
  c.fcs=c.gs.map(g=>({g,...c.fc(g)}));
  c.hasJia=c.fcs.some(x=>x.k==='甲');
  c.klass=c.mixed?(c.hasJia?'戊1':'戊2'):c.fc(c.g).k; // 複合用途：戊類第 1 目（有甲類）或第 2 目
  c.klassTxt=c.mixed?(c.hasJia?'戊類第 1 目（複合用途建築物中有供甲類場所）':'戊類第 2 目（複合用途建築物，無甲類）')+'：'+c.fcs.map(x=>`${x.g}→${x.t}`).join('；'):c.fc(c.g).t;
  c.jiaFloors=[];for(let f=1;f<=c.F;f++) if(c.fc(c.fg[f]).k==='甲') c.jiaFloors.push(f);
  c.jiaArea=c.jiaFloors.length*c.per;
  return c;
}
// 供公眾使用建築物之範圍（99.03.03 令）對到使用類組的近似；實際以用途名稱認定
function pubOf(g,c){
  const a=c.areaOf(g), A=`${g} 約 ${Math.round(a)}㎡`;
  const yes=(w)=>({on:true,why:w}), no=(w)=>({on:false,why:w}), may=(w)=>({on:'info',why:w});
  if(inG(g,'A-1')) return yes('戲院、電影院、演藝場、集會堂等（第 1、9 點）');
  if(inG(g,'A-2')) return yes('車站、航空站（第 18 點）');
  if(inG(g,'B-1')) return yes('舞廳、歌廳、視聽伴唱等（第 2、4 點）');
  if(inG(g,'B-2')) return a>=500?yes(`市場、百貨商場、超級市場，${A} ≥500㎡（第 6 點）`):no(`市場、商場 ${A} <500㎡（第 6 點）`);
  if(inG(g,'B-3')) return a>=300?yes(`餐廳、咖啡廳、食堂，${A} ≥300㎡（第 7 點）`):no(`餐廳等 ${A} <300㎡（第 7 點）`);
  if(inG(g,'B-4')) return yes('旅館類（第 5 點）');
  if(inG(g,'C')){
    if(c.ind==='warehouse') return a>=300?yes(`倉庫、汽車庫、修車場，${A} ≥300㎡（第 15 點）`):no(`倉庫等 ${A} <300㎡（第 15 點）`);
    const lim=c.urban?200:500, kl=c.urban?37.5:75;
    if(a>=lim) return yes(`工廠，${c.urban?'都市計畫內':'都市計畫外'}作業廠房合計約 ${Math.round(a)}㎡ ≥${lim}㎡（第 17 點）`);
    if(c.kw!=null) return c.kw>=kl?yes(`工廠用電 ${c.kw}kW ≥${kl}kW（第 17 點）`):no(`工廠作業廠房 <${lim}㎡ 且用電 ${c.kw}kW <${kl}kW（第 17 點）`);
    return may(`工廠作業廠房約 ${Math.round(a)}㎡ <${lim}㎡；用電（含電熱）達 ${kl}kW 也算供公眾使用，未填用電（第 17 點）`);}
  if(inG(g,'D-1')) return yes('保齡球館、健身中心、遊藝場等（第 4 點）');
  if(inG(g,'D-2')) return yes('博物館、美術館、圖書館、集會堂等（第 9 點）');
  if(inG(g,'D-3','D-4')) return yes('學校（第 16 點）');
  if(inG(g,'D-5')) return a>=200?yes(`補習班、訓練班 ${A} ≥200㎡；托兒所、幼稚園、課後托育不限面積（第 16 點）`):may(`補習班、訓練班 ${A} <200㎡ 不算；但托兒所、幼稚園、供學童使用的補習班、課後托育中心不限面積（第 16 點）`);
  if(inG(g,'E')) return yes('寺廟、教堂、宗祠、殯儀館、納骨堂（第 10、19 點）');
  if(inG(g,'F-1')) return yes('醫院、療養院、護理機構（第 12 點）');
  if(inG(g,'F-2','F-3')) return yes('身心障礙福利機構、兒童及少年安置教養機構、托兒所等（第 12、16 點）；老人安養機構另有樓層面積條件');
  if(inG(g,'G-1')) return yes('銀行、郵局、證券交易場所等營業所（第 13 點）');
  if(inG(g,'G-2')) return a>=500?yes(`辦公廳，${A} ≥500㎡（第 14 點；同一建照各棟合計，國土署 113.10.14 國署建管字第 1131160013 號函）`):no(`辦公廳 ${A} <500㎡（第 14 點）`);
  if(inG(g,'G-3')) return may('一般店鋪、診所不在範圍列舉內，原則非供公眾使用；但以餐飲、理容等用途認定者另看各點');
  if(inG(g,'H-1')) return a>=500?yes(`寄宿舍 ${A} ≥500㎡（第 5 點）`):may(`寄宿舍 ${A} <500㎡ 不算；但安養機構、住宿型精神復健機構另依第 12 點認定`);
  if(inG(g,'H-2')) return c.F>=6?yes(`六層以上之集合住宅（第 20 點）`):no(`五層以下住宅、集合住宅（第 20 點限六層以上）；但任一戶任一層分間 6 個以上使用單元或 10 床以上者歸 H-1 並屬供公眾使用（內政部 107.04.24 台內營字第 1070803969 號令）`);
  return may('依第 22 點由中央主管建築機關指定，請個案確認');
}
// 法定停車（第 59 條）：分用途計算；免設部分擇一適用；其中一類未達設置標準時合併以較高標準計算（說明三）
function parkCalc(c){
  const cls=new Map();
  for(const g of c.gs){const p=c.parkClass(g); if(!p) return null; const k=p.k; const r=cls.get(k)||{...p,area:0,gs:[]}; r.area+=c.areaOf(g); r.gs.push(g); cls.set(k,r);}
  const L=[...cls.values()].map(x=>({...x,rate:c.urban?x.ru:x.rn}));
  if(L.length===1){const x=L[0];return {free:x.f,rate:x.rate,k:x.k,n:x.area>x.f?Math.ceil((x.area-x.f)/x.rate):0,mode:'single',L};}
  if(L.some(x=>x.area<=x.f)){const s=[...L].sort((a,b)=>a.rate-b.rate||a.f-b.f)[0], A=L.reduce((t,x)=>t+x.area,0);
    return {free:s.f,rate:s.rate,k:s.k,n:A>s.f?Math.ceil((A-s.f)/s.rate):0,mode:'merge',L};}
  let best=null; for(const keep of L){const n=L.reduce((t,x)=>t+Math.ceil(Math.max(0,x.area-(x===keep?x.f:0))/x.rate),0); if(!best||n<best.n) best={n,keep};}
  return {free:best.keep.f,rate:null,k:best.keep.k,n:best.n,mode:'split',L,keep:best.keep};
}


/* 各樓層標籤：由頂層往下 */
function levels(c){const a=[];for(let i=c.F;i>=1;i--)a.push(i+'F');for(let i=1;i<=c.B;i++)a.push('B'+i);return a;}
const ex961=c=>c.F>=3&&c.F<=5&&c.fp&&c.allG('H-2','D-3','D-4');
const fr=(a,b)=>a===b?a+'F':`${a}F～${b}F`;
function span(a){return a.length?(a.length===1?a[0]:a[0]+'～'+a[a.length-1]):'';}

const R=[];
const rule=(id,cat,law,art,title,fn,opt={})=>R.push({id,cat,law,art,title,fn,...opt});

/* ───── 構造與防火 ───── */
rule('fp69','構造與防火',DS,'69','應為防火構造',c=>({
  on:c.fpNeed, lvl:c.fpNeed?'need':'',
  why:c.fpNeed?`${c.fpWhy}；本案地上 ${c.F} 層${c.mixed?'，用途 '+c.useTxt:''}`:`未達門檻（${c.fpWhy}）`,
  req:['主要構造（柱、梁、承重牆、樓地板、屋頂）須為防火構造','後續防火時效、區劃、防火間隔都以防火構造為前提'],
  note:[c.fpConflict?'輸入填「非防火構造」，但依第 69 條本案應為防火構造；以下各條一律以防火構造檢討':'',c.anyG('C')?'工廠：即使不必為防火構造，作業廠房樓地板面積合計超過 50㎡ 者主要構造仍須用不燃材料（第 69 條但書）；變電所、汽車修理場等總樓地板 150㎡ 以上就要防火構造':'',!c.fpNeed?'未達門檻者可做非防火構造，但會改用較嚴的步行距離（30m）、二座樓梯門檻（第 95 條第 2 款）與第 84-1、110-1 條':''].filter(Boolean).join('；')||null}));
rule('fp70','構造與防火',DS,'70','主要構造防火時效',c=>{
  if(!c.fp) return {on:false,why:'非防火構造'};
  const L=levels(c), t1=L.slice(0,4), t2=L.slice(4,14), t3=L.slice(14), calc=[];
  calc.push([span(t1),'柱 1｜梁 1｜樓板 1｜承重牆 1 小時']);
  if(t2.length) calc.push([span(t2),'柱 2｜梁 2｜樓板 2｜承重牆 1 小時']);
  if(t3.length) calc.push([span(t3),'柱 3｜梁 3｜樓板 2｜承重牆 2 小時']);
  calc.push(['屋頂','半小時']);
  return {on:true,lvl:t3.length?'3h':t2.length?'2h':'1h',why:`自頂層往下數，層數含地下層：共 ${L.length} 層`,calc,
    req:['屋頂突出物未達計層面積者，時效同頂層']};});
rule('fp110','構造與防火',DS,'110','防火間隔（防火構造）',c=>({
  on:c.fp, why:c.fp?'防火構造建築物，鄰接 6m 以上道路或永久性空地側除外':'非防火構造改依第 110-1 條',
  req:['距境界線未達 1.5m 的外牆：1 小時防火時效，開口設同等時效防火門或固定式防火窗','1.5m 以上未達 3m：半小時防火時效','同基地兩幢間：未達 3m 為 1 小時、3m 以上未達 6m 為半小時','配合第 90 條的避難層出入口，基地內留設淨寬 1.5m 避難用通路接到道路']}));
rule('fp110-1','構造與防火',DS,'110-1','防火間隔（非防火構造）',c=>({
  on:!c.fp, why:!c.fp?'非防火構造':'本案為防火構造',
  req:['後側及兩側自境界線退縮淨寬 1.5m 以上','同基地兩幢間留設淨寬 3m 以上']}));

/* ───── 防火區劃與內裝 ───── */
rule('z79','防火區劃與內裝',DS,'79','面積區劃：每 1,500㎡',c=>({
  on:c.fp&&c.total>=1500, why:`防火構造且總樓地板面積 ${m2(c.total)} ${c.total>=1500?'≥':'<'} 1,500㎡`,
  req:['每 1,500㎡ 以 1 小時防火時效牆壁、防火門窗及樓地板區劃，防火設備另須 1 小時阻熱性','設有效自動滅火設備的範圍，面積得免計二分之一','區劃牆突出外牆面 50cm 以上，或交接處外牆 90cm 以上同等時效']}));
rule('z79-2','防火區劃與內裝',DS,'79-2','垂直區劃：梯間、昇降機道、管道間、挑空',c=>({
  on:c.fp&&(c.F+c.B)>=2, why:c.fp?`防火構造，共 ${c.F+c.B} 層`:'非防火構造',
  req:['挑空、安全梯梯間、昇降機道、管道間以 1 小時防火時效區劃','昇降機道防火設備須具遮煙性能；管道間維修門 1 小時時效＋遮煙','挑空連跨 3 層以下且 1,500㎡ 以下者得免'],
  note:(c.F+c.B)<=3&&c.total<=1500?`全棟 ${c.F+c.B} 層、${fmt(c.total)}㎡：樓梯及挑空可依第三項第二款免區劃；昇降機道與管道間仍要`:null}));
rule('z83','防火區劃與內裝',DS,'83','11 層以上部分的加強區劃',c=>{
  const h2=c.allG('H-2'), k=h2?2:1;
  return {on:c.F>=11, why:`地上 ${c.F} 層 ${c.F>=11?'≥':'<'} 11 層`,
   calc:c.F>=11?[[fr(11,c.F),`標準層 ${m2(c.typ)}，${c.typ>100*k?'需再區劃':'單層未超過基本區劃面積'}`]]:null,
   req:[`基本：每 ${100*k}㎡ 區劃${h2?'（H-2 得放寬為 200㎡）':''}`,`1.2m 以上牆面及天花板用耐燃一級：每 ${200*k}㎡`,'牆面及天花板（含底材）全用耐燃一級：每 500㎡','設有效自動滅火設備，面積得免計二分之一；防火門窗須 1 小時阻熱性']};});
rule('z88','防火區劃與內裝',DS,'88','內部裝修材料限制',c=>{
  const h2=c.allG('H-2');
  if(h2) return {on:c.F>=11,verify:true,why:c.F>=11?'H-2 表列居室無一般限制，但 11 層以上部分仍受限':'H-2 表列居室無一般限制（無窗戶居室、使用燃燒設備的房間仍受限）',
    req:['11 層以上部分：依防火區劃面積決定耐燃等級（200㎡ 內區劃者耐燃二級以上、500㎡ 內區劃者耐燃一級）','通達地面的走廊及樓梯用耐燃一級']};
  return {on:true,verify:true,why:`${c.gs.filter(g=>g!=='H-2').join('、')} 組列於第 88 條附表`,
    req:['居室：耐燃三級以上（部分類組為二級）；通達地面的走廊及樓梯：耐燃二級以上','每 100㎡ 以 1 小時時效區劃，或設自動滅火＋排煙設備者得免（B-1、B-2、B-3、I 除外）','11 層以上部分、地下層、無窗戶居室另有較嚴規定']};});

/* ───── 避難逃生 ───── */
rule('e90','避難逃生',DS,'90','直通樓梯在避難層的出入口',c=>{
  if(c.F+c.B<2) return {on:false,why:'單層建築，無直通樓梯'};
  const ar=c.gs.filter(g=>inG(g,'A','B','D','E','F','G','H-1')).reduce((t,g)=>t+c.areaOf(g),0);
  const two=c.F>=6||ar>500;
  return {on:true,lvl:two?'two':'one',why:two?(c.F>=6?`地上 ${c.F} 層 ≥ 6 層`:`A、B、D、E、F、G 類及 H-1 使用面積合計 ${m2(ar)} > 500㎡`):'未達 6 層，A、B、D、E、F、G 類及 H-1 面積合計未超過 500㎡，只檢討出入口尺寸',
   req:two?['避難層開設二處以上不同方向的出入口（梯出口直接開向道路或避難用通路者除外）','至少一處直通道路，其餘可開向寬 1.5m 以上避難通路','每處出入口寬 ≥1.2m、高 ≥1.8m']:['開向屋外的出入口寬 ≥1.2m、高 ≥1.8m']};});
rule('e92','避難逃生',DS,'92','走廊寬度',c=>{
  let a,b,why;
  if(c.anyG('D-3','D-4','D-5')){a=2.4;b=1.8;why='教室使用部分';}
  else if(c.typ>=200||c.anyG('F-1')){a=1.6;b=1.2;why=c.anyG('F-1')&&c.typ<200?'F-1 組':`同層居室面積約 ${m2(c.typ)} ≥ 200㎡（地下層為 100㎡）`;}
  else {a=1.2;b=1.2;why=`同層居室面積約 ${m2(c.typ)} < 200㎡`;}
  return {on:true,lvl:a+'',why,calc:[['兩側有居室的走廊',a+' m 以上'],['其他走廊',b+' m 以上']],
   req:c.fp?['連接直通樓梯的走廊牆壁及樓地板：1 小時防火時效、耐燃一級裝修','走廊地板坡度不得超過 1/10，不得設臺階']:['走廊地板坡度不得超過 1/10，不得設臺階'],
   note:'此處以標準層面積近似「同層居室樓地板面積」'};});
rule('e93','避難逃生',DS,'93','步行距離',c=>{
  if(c.F+c.B<2) return {on:false,why:'單層建築'};
  const dOf=g=>inG(g,'A','B-1','B-2','B-3','D-1')?30:g[0]==='C'?70:50;
  // 只看避難層以外的樓層（假設 1F 為避難層；地下層以主要類組計）
  const up=[...new Set([...c.fg.slice(2),...(c.B>0?[c.g]:[])])]; const gs=up.length?up:c.gs;
  let d=Math.min(...gs.map(dOf));
  const calc=[];
  if(!c.fp){d=Math.min(d,30);calc.push(['各樓層','30 m 以下（非防火構造）']);}
  else{calc.push([c.F>=15?`14F 以下`:'各樓層',d+' m 以下']);
    if(c.F>=15&&d<=50) calc.push([fr(15,c.F),(d===30?20:40)+' m 以下']);}
  if(new Set(gs.map(dOf)).size>1) calc.push(['各用途',gs.map(g=>`${g} ${dOf(g)} m`).join('、')+'（表列以最嚴者為準，實際依各樓層用途）']);
  const only1=c.gs.filter(g=>!gs.includes(g)); if(only1.length) calc.push(['只在 1F（避難層）的用途',`${only1.join('、')}：避難層以外才檢討本款；避難層梯口到屋外出入口依第 94 條`]);
  if(c.anyG('H-2')) calc.push(['複層式住宅無出入口樓層','40 m 以下']);
  return {on:true,lvl:(c.F>=15?'15':'')+d,why:'任何建築物避難層以外各樓層都要有直通樓梯',calc,
   req:['居室任一點到樓梯口的實際可行距離（非直線）','算到直通樓梯第一階；安全梯可算到梯間防火門','避難層：梯口到屋外出入口同樣受此距離限制（第 94 條）']};});
rule('e95','避難逃生',DS,'95','二座以上直通樓梯',c=>{
  const k=c.fp?1:0, T=(a,b)=>k?a:b;
  const thrOf=(g,f)=>g==='A-1'?0:g==='F-1'?null:inG(g,'H-1','B-4','H-2')?T(240,100):f===2?T(400,200):T(240,100);
  const txtOf=g=>g==='A-1'?'A-1 組，避難層以外樓層一律':g==='F-1'?`F-1 組：該層病房面積超過 ${T(100,50)}㎡`:inG(g,'H-1','B-4','H-2')?`${g}：該層樓地板面積超過 ${T(240,100)}㎡`:`${g}：避難層直上層超過 ${T(400,200)}㎡、其他任一層超過 ${T(240,100)}㎡`;
  const txt=c.gs.map(txtOf).join('；');
  const over=[];for(let f=2;f<=c.F;f++){const t=thrOf(c.fg[f],f);if(t!=null&&c.typ>t)over.push(f);}
  const thr=c.F>=2?thrOf(c.fg[Math.min(3,c.F)],Math.min(3,c.F)):null;
  const byArea=over.length>0, by8=c.F>=8, byB=c.B>0&&c.b1>=200;
  const parts=[];
  if(byArea) parts.push(`${span(over.map(f=>f+'F'))}（該層 ${m2(c.typ)} 超過門檻）`);
  else if(by8) parts.push(`${fr(8,c.F)}（八層以上之樓層）`);
  if(byB) parts.push(`地下層（單層 ${m2(c.b1)} ≥ 200㎡）`);
  const on=parts.length>0;
  return {on,lvl:(byArea?'A':by8?'8':'')+(byB?'B':''),
   why:on?parts.join('；'):`未達 8 層，且各層未超過門檻（${txt}）`,
   calc:on?parts.map(p=>[p.split('（')[0],'2 座以上直通樓梯']):null,
   req:['二座梯的步行路徑重複部分，不得大於最大容許步行距離的 1/2','本條面積可扣除機械房、直通樓梯間、電梯間、室內停車等（第 89 條第 5 款）；此處以標準層全部面積試算，偏嚴'],
   note:c.anyG('F-1')?'F-1 另看病房面積，請自行確認':(by8&&!byArea?'8 層以上樓層才需二座；7 層以下若各層未超過面積門檻可為一座':null)};});
rule('e96','避難逃生',DS,'96','安全梯／特別安全梯',c=>{
  const sp=c.F>=15||c.B>=3, sf=c.F>=6||c.B>=2, one=c.F>=3;
  if(!one&&!sf&&!sp) return {on:false,why:`地上 ${c.F} 層、地下 ${c.B} 層，未達 3 層`};
  const ex=ex961(c);
  if(ex&&!sf) return {on:false,why:`3～5 層防火構造，僅供 ${c.allG('H-2')?'住宅':'校舍'}使用，依第 96-1 條免改設安全梯`};
  const calc=[];
  if(c.F>=15) calc.push([`通達 15F 以上的梯`,'特別安全梯或戶外安全梯']);
  if(c.F>=6) calc.push([c.F>=15?'只通達 6F～14F 的梯':`通達 ${fr(6,c.F)} 的梯`,'安全梯']);
  else if(c.F>=3&&!ex) calc.push([`通達 ${fr(3,c.F)}`,'至少一座為安全梯']);
  else if(c.F>=3) calc.push([`只通達 ${fr(3,c.F)} 的梯`,'免改設（第 96-1 條）']);
  if(c.B>=3) calc.push(['通達 B3 以下的梯','特別安全梯或戶外安全梯']);
  else if(c.B===2) calc.push(['通達 B2 的梯','安全梯']);
  const small=(c.F>=15&&c.typ<=100)||(c.B>=3&&c.b1<=100);
  return {on:true,lvl:sp?'special':sf?'safe':'one',
   why:`地上 ${c.F} 層、地下 ${c.B} 層`,calc,
   req:['直通樓梯構造具半小時以上防火時效','安全梯梯間牆 1 小時時效、耐燃一級裝修；出入口 1 小時時效＋半小時阻熱＋遮煙防火門，寬 ≥90cm，不得設門檻（第 97 條）'].concat(sp?['特別安全梯須設排煙室或陽臺；15 層以上或地下 3 層以下樓層，排煙室／陽臺面積 ≥ 該層居室面積 3%（A-1、B-1～B-3、D-1、D-2 為 5%）']:[]),
   note:small?'15 層以上或地下 3 層以下各樓層面積未超過 100㎡ 者，可改設一般安全梯':(!sf&&one?'只需一座安全梯時，步行距離檢討到直通樓梯即可，不必每點都到安全梯':null)};});
rule('e96-1','避難逃生',DS,'96-1','3～5 層住宅免改設安全梯',c=>{
  if(c.F<3||c.F>5) return {on:false,why:`只適用地上 3～5 層，本案 ${c.F} 層`};
  if(!c.fp) return {on:false,why:'須為防火構造，本案勾選非防火構造'};
  if(!c.allG('H-2','D-3','D-4')) return {on:'info',why:`${c.mixed?'混合用途 '+c.useTxt:c.g+' 組'}：第一款不適用（整棟只要混入其他用途就不行）；只有一棟一戶的獨棟或連棟住宅，一、二樓兼作 D-5、G-2、G-3 並以 1 小時區劃分隔，且非供公眾使用時，可依第二款免設`};
  return {on:true,why:`地上 ${c.F} 層防火構造，僅供 ${c.allG('H-2')?'住宅、集合住宅':'校舍'}使用`,
   req:['得免受第 96 條第一款（3～5 層至少一座安全梯）的限制','整棟只要混入其他用途（例如一樓店面）就不適用，改依第 96 條設安全梯；一棟一戶兼作 D-5、G-2、G-3 者另依本條第二款'],
   note:c.B>=2?'地下 2 層以上部分仍依第 96 條第二款設安全梯，本條只免除 3～5 層那一款':null};});
rule('e99','避難逃生',DS,'99','屋頂避難平臺',c=>{
  const fl=[];for(let f=5;f<=c.F;f++) if(inG(c.fg[f],'A-1','B-1','B-2')) fl.push(f);
  const on=fl.length>0;
  return {on,why:on?`${span(fl.map(f=>f+'F'))} 供 ${[...new Set(fl.map(f=>c.fg[f]))].join('、')} 使用（5 層以上樓層）`:c.anyG('A-1','B-1','B-2')?'A-1、B-1、B-2 用途不在 5 層以上':'僅 A-1、B-1、B-2 組適用',
   calc:on?[['平臺面積合計',`≥ ${m2(c.typ/2)}（5 層以上最大樓地板面積的 1/2）`]]:null,
   req:['任一邊長 ≥6m；以戶外安全梯或特別安全梯通達','通達該樓層的直通樓梯均為戶外安全梯或特別安全梯（第 96 條）']};});
rule('e99-1','避難逃生',DS,'99-1','樓層分二區劃（護理、老人福利等）',c=>{
  const on=c.anyG('F-1','F-2','H-1');
  return {on:on?'info':false,why:on?`${c.gs.filter(g=>inG(g,'F-1','F-2','H-1')).join('、')} 組若為護理之家、老人福利機構、住宿型精神復健機構、F-2 機構或學校才適用`:'僅 F-1、F-2、H-1 特定機構適用',
   req:['避難層以外樓層分成二個以上區劃，各以走廊連接安全梯','區劃間出入口寬 ≥120cm，防火設備具遮煙性能']};});
rule('e100','避難逃生',DS,'100','排煙設備（技術規則）',c=>{
  const g=c.anyG('A-1','B'), on=g&&c.typ>500;
  return {on:on?true:'info',verify:true,
   why:on?`${c.gs.filter(x=>inG(x,'A-1','B')).join('、')} 組每層 ${m2(c.typ)} > 500㎡`:'條文沿用舊分類（第一類、第四類、第二類的養老院及兒童福利設施）；無窗戶居室不論類組都要設',
   req:['每層樓地板面積超過 500㎡ 應設（每 100㎡ 以分間牆或防煙壁區劃者除外）','無窗戶居室應設'].concat(c.H>30||c.bsum>1000?[`高度 ${c.H}m 超過 30m 或地下層超過 1,000㎡：排煙設備的控制與監視集中於中央管理室（第 101 條第 7 款）`]:[])};});
rule('e108','避難逃生',DS,c=>c.high?'233':'108','緊急進口',c=>{
  if(c.F<2) return {on:false,why:'未達 2 層'};
  const top=c.high?Math.min(c.F,16):Math.min(c.F,10);
  return {on:true,lvl:c.high?'h':'n',why:c.high?'高層建築物：2 層以上至 16 層（或地板面高度 50m 以下）':'2 層以上、10 層以下各樓層',
   calc:[[fr(2,top),'設緊急進口，或以替代開口免設']],
   req:['面臨道路或寬 4m 以上通路，且外牆每 10m 有窗戶或開口者免設','替代開口：寬 ≥75cm、高 ≥1.2m（或直徑 ≥1m 圓孔），下緣距樓地板 ≤80cm，無柵欄']};});

/* ───── 昇降設備 ───── */
rule('l55','昇降設備',DS,'55','昇降機',c=>({
  on:c.F>=6, why:`地上 ${c.F} 層 ${c.F>=6?'≥':'<'} 6 層`,
  req:['至少一座昇降機通達避難層','機廂每樓層出入口不得超過二處']}));
rule('l106','昇降設備',DS,'106','緊急用昇降機',c=>{
  if(c.F<=10) return {on:false,why:`地上 ${c.F} 層，未超過 10 層`};
  const up=c.typ*(c.F-10);
  if(up<500) return {on:false,why:`超過 10 層部分各層面積合計 ${m2(up)} < 500㎡，免設`};
  let calc,lvl,note=null;
  if(c.typ<=1500){calc=[['座數','至少 1 座']];lvl='1';}
  else{const lo=1+Math.floor((c.typ-1500)/3000), hi=1+Math.ceil((c.typ-1500)/3000);lvl=hi+'';
    calc=[['座數（保守）',`${hi} 座`]]; if(lo!==hi) calc.push(['座數（字面「每達」）',`${lo} 座`]);
    note='超過 1,500㎡ 後「每達 3,000㎡ 增設一座」的進位有兩種讀法，條文未明示；建議以保守座數規劃或向建管確認';}
  return {on:true,lvl,why:`地上 ${c.F} 層超過 10 層；11 層以上最大單層 ${m2(c.typ)}`,calc,note,
   req:['機間樓地板面積每座 ≥10㎡（不含機道、機廂），四周 1 小時防火時效、耐燃一級裝修，設排煙設備','機間出入口除開向特別安全梯外限設一處，避難層也一樣','機間出入口為 1 小時防火門；避難層機間到屋外出入口步行距離 ≤30m，出入口臨接寬 4m 以上道路或通道','速度 ≥60 m/min，接緊急電源（第 107 條）']};});

/* ───── 高層建築專章 ───── */
const hi=(id,art,title,fn)=>rule(id,'高層建築專章',DS,art,title,c=>c.high?fn(c):(id==='h227'&&c.nearHigh?{on:'info',why:`地上 ${c.F} 層未達 16 層，但估算高度約 ${c.H}m，已貼近 50m；實際建築高度一旦達 50m 就整章適用`,req:['請填入實際建築高度再判斷','高層章會多出：二座特別安全梯、防災中心、全棟撒水、落物曲線退縮、特殊結構審查等']}:{on:false,why:`地上 ${c.F} 層、高度 ${c.H}m${c.Hest?'（估）':''}，未達 16 層或 50m`}));
hi('h227','227','屬高層建築物',c=>({on:true,lvl:'y',why:c.F>=16?`地上 ${c.F} 層 ≥ 16 層`:`高度 ${c.H}m ≥ 50m`,
  req:['適用第十二章全部規定（第 227～259 條）','燃氣、給排水、電氣、通風、消防等設備另依第 245～258 條檢討']}));
hi('h228','228','總樓地板面積與留設空地之比',c=>{
  const lim=c.zone==='com'?30:15;
  if(!c.site) return {on:true,why:'高層建築物',calc:[['上限',`${lim}（${c.zone==='com'?'商業區':'住宅區及其他分區'}）`]],note:'填入基地面積與建築面積可試算'};
  const open=c.site-c.ba, r=open>0?c.vfa/open:Infinity;
  return {on:true,lvl:r>lim?'over':'ok',why:'高層建築物',
   calc:[['總樓地板面積（容積）',m2(c.vfa)+(c.vfaEst?'（未填，以地上樓地板估）':'')],['留設空地',m2(open)],['比值',`${fmt(r)}（上限 ${lim}）${r>lim?' ⚠ 超過':''}`]],
   req:['「總樓地板面積」依第 162 條容積樓地板面積核計，不計入的地下停車、機電、陽臺等可扣除'],
   note:c.vfaEst?'填入容積樓地板面積會更準；地上樓地板通常含不計容積部分，估值偏嚴':null};});
hi('h229','229','落物曲線退縮',c=>{
  if(c.H<=50) return {on:true,why:'高層建築物；高度 50m 以下部分免退縮',calc:[['退縮','本案高度未超過 50m，免退縮']]};
  return {on:true,why:`高度 ${c.H}m${c.Hest?'（估）':''} 超過 50m 的部分須退縮`,
   calc:[['50m 處',fmt(Math.sqrt(50)/2)+' m'],[`頂部 ${c.H}m 處`,fmt(Math.sqrt(c.H)/2)+' m']],
   req:['自建築線及地界線退縮；退縮距離＝該部分至基地地面高度的平方根 ÷ 2']};});
hi('h230','230','地下各層最大樓地板面積',c=>{
  if(!c.site||c.bcr==null) return {on:true,why:'高層建築物',req:['A₀ ≦ (1＋Q)A ÷ 2（Q 為最大建蔽率，A 為基地面積）'],note:'填入基地面積與建蔽率可試算'};
  const lim=(1+c.bcr/100)*c.site/2;
  return {on:true,lvl:c.b1>lim?'over':'ok',why:'高層建築物',
   calc:[['地下單層上限',m2(lim)+`（基地 ${fmt(c.site)} × (1＋${c.bcr}%) ÷ 2）`],['本案地下單層',m2(c.b1)+(c.b1>lim?' ⚠ 超過':'')]],
   req:['因施工安全或停車設備需要，經預審認定者得放寬']};});
hi('h241','241','二座以上特別安全梯',c=>({on:true,lvl:'y',why:'高層建築物',
  req:['二座特別安全梯設在不同平面位置，符合二方向避難，排煙室不得共用','連接特別安全梯的走廊自成獨立防火區劃（1 小時）','通達 16 層以上或地板面高度 50m 以上樓層的直通樓梯全部為特別安全梯','通達地上樓層與地下樓層的梯間不得直通','二方向避難以重複步行距離控制，非居室部分免檢討']}));
hi('h242','242','昇降機間獨立區劃',c=>({on:true,why:'高層建築物',
  req:['昇降機道併同昇降機間自成獨立防火區劃（1 小時），機間出入口防火設備具遮煙性能','連接昇降機間的走廊也自成獨立防火區劃']}));
hi('h243','243','燃氣設備限制',c=>({on:true,why:'高層建築物',
  req:['16 層以上或 50m 以上部分不得使用燃氣設備（住宅、餐廳等機能必要者除外）','設燃氣設備時集中設置，設瓦斯漏氣自動警報，並以 1 小時防火時效區劃；未設燃氣的住戶廚房不受本條限制']}));
hi('h244','244','緊急昇降機間與載重',c=>({on:true,why:'16 層以上或 50m 以上樓層',
  req:['16 層以上或 50m 以上樓層設緊急昇降機間','緊急用昇降機載重 17 人（1,150kg）以上，速度 ≥60 m/min','避難層到最上層一分鐘內抵達']}));
hi('h259','259','防災中心',c=>{const adv=c.F>=25||c.H>=90;return {on:true,lvl:adv?'adv':'y',why:'高層建築物'+(adv?`；達 25 層或 90m`:''),
  req:['設於避難層或其直上、直下層，樓地板面積 ≥40㎡','2 小時防火時效區劃，耐燃一級裝修','電力、消防、排煙、昇降、廣播、瓦斯遮斷等設備的顯示與控制集中於此'].concat(adv?['25 層或 90m 以上：另須具備記錄監視、連動、火災處理流程指導、逃生引導廣播等監控系統']:[])};});

/* ───── 一般設計 ───── */
rule('g33','一般設計',DS,'33','樓梯及平臺尺寸',c=>{
  if(c.F+c.B<2) return {on:false,why:'單層建築'};
  let w,rh,rd,why;
  if(c.anyG('D-3')){w='1.40';rh=16;rd=26;why='小學校舍';}
  else if(c.anyG('D-4','F-1','A-1','B-1')||(c.anyG('B-2')&&c.areaOf('B-2')>=1500)){w='1.40';rh=18;rd=26;why='學校、醫院、戲院、商場等';}
  else if(c.typ>200){w='1.20';rh=20;rd=24;why=`每層居室面積約 ${m2(c.typ)} 超過 200㎡`;}
  else {w='0.75';rh=20;rd=21;why='每層居室面積未超過 200㎡';}
  return {on:true,lvl:w,why,calc:[['樓梯及平臺寬',w+' m 以上'],['級高',rh+' cm 以下'],['級深',rd+' cm 以上']],
   req:['進入安全梯的門扇迴轉半徑不得與梯內樓梯寬度的迴轉半徑相交','依第 95、96 條設置的戶外直通樓梯，寬度得減為 90cm'],
   note:c.B>0?'地下層看的是各層「居室」面積，停車空間不算；地下若有超過 200㎡ 的居室，樓梯改用 1.20m':null};});
rule('g38','一般設計',DS,'38','欄杆扶手高度',c=>{
  const strict=c.anyG('A-1','A-2','B-2','D-2','D-3','F-3','G-2','H-2');
  const calc=[[c.F>=10?'9F 以下':'各樓層','1.10 m 以上']]; if(c.F>=10) calc.push([fr(10,c.F),'1.20 m 以上']);
  return {on:true,lvl:c.F>=10?'1.2':'1.1',why:'露臺、陽臺、室外走廊、室外樓梯、平屋頂、室內天井',calc,
   req:strict?[`${c.gs.filter(g=>inG(g,'A-1','A-2','B-2','D-2','D-3','F-3','G-2','H-2')).join('、')} 組：欄杆不得有可供直徑 10cm 物體穿越的鏤空，也不得有可攀爬的水平橫條`]:[]};});
rule('g46','一般設計',DS,'46','隔音構造',c=>{
  const h2=c.anyG('H-2'), p=c.anyG('H-1','B-4','F-1');
  if(!h2&&!p) return {on:false,why:'僅住宅、寄宿舍、旅館、醫院病房適用'};
  return {on:true,why:h2?'集合住宅的分戶牆、分戶樓板':'臥室、客房、病房的分間牆',
   req:h2?['分戶牆：空氣音隔音 Rw ≥50dB，或 RC 含粉刷 ≥15cm 等（第 46-4 條）','分戶樓板：衝擊音 Ln,w ≤58dB，或 RC 樓板 ≥15cm 加緩衝材（第 46-6 條）','昇降機道與居室相鄰的牆：Rw ≥55dB，或 RC 含粉刷 ≥20cm']
     :['分間牆：空氣音隔音 Rw ≥45dB，或 RC 含粉刷 ≥10cm 等（第 46-3 條）','昇降機道與居室相鄰的牆：Rw ≥55dB，或 RC 含粉刷 ≥20cm']};});
rule('g164','一般設計',DS,'164-1','住宅樓層高度與挑空',c=>{
  if(!c.anyG('H-2')) return {on:false,why:'僅住宅、集合住宅類適用'};
  return {on:true,why:'住宅、集合住宅',calc:[['地面一層','4.2 m 以下'],['其餘各層','3.6 m 以下']],
   req:['挑空每戶限一處，設於客廳或客餐廳上方，每處 ≥15㎡，合計不超過允建總容積樓地板面積 1/10','挑空樓層高度 ≤6m','夾層只能在地面層或最上層擇一設置']};});
rule('g20','一般設計',EQ,'20','避雷設備',c=>({
  on:c.H>=20, why:`建築物高度 ${c.H}m${c.Hest?'（估）':''} ${c.H>=20?'≥':'<'} 20m`, req:['依建築設備編第一章第五節設置避雷設備']}));
rule('g116','一般設計',DS,'116-1','公共空間安全維護裝置',c=>({
  on:c.pub, why:c.pub?'供公眾使用建築物':'非供公眾使用建築物',
  req:['公共空間依第 116-2 條附表設置監視攝影、緊急求救、警戒探測等裝置','停車空間、車道、電梯車廂、安全梯間、屋頂避難平臺、防災中心等為主要對象']}));

/* ───── 停車與防空 ───── */
rule('p59','停車與防空',DS,'59','法定停車位',c=>{
  const P=c.park; if(!P) return {on:'info',why:'含 I 類，屬第五類，由內政部另定'};
  const nm={1:'第一類（集會、商業、辦公等）',2:'第二類（住宅、集合住宅等）',3:'第三類（旅館、文教、醫院、福利等）',4:'第四類（倉庫、學校、工廠等）'};
  const calc=[];
  if(P.mode==='single'){const x=P.L[0];calc.push(['計算面積',m2(x.area)+'（地上樓地板）'],['法定車位',P.n+' 輛'+(P.n?`　(${fmt(x.area)}−${x.f}) ÷ ${x.rate}，零數進一`:'')]);}
  else {for(const x of P.L) calc.push([`${nm[x.k]}（${x.gs.join('、')}）`,`約 ${m2(x.area)}，免設 ${x.f}㎡、每 ${x.rate}㎡ 一輛`]);
    calc.push(['法定車位',P.n+' 輛'+(P.mode==='merge'?'（有一類未達設置標準，依說明三合併以較高標準計算）':`（免設部分擇一適用：用${nm[P.keep.k]}的免設面積）`)]);}
  return {on:P.n>0,lvl:P.n>0?'y':'',why:`${c.urban?'都市計畫內':'都市計畫外'}；${P.L.map(x=>nm[x.k]).join('、')}`,calc,
   req:['計算面積不含室內停車空間、法定防空避難設備、騎樓門廊、機械房、變電室、蓄水池、屋頂突出物','都市計畫書或土管另有規定者優先'].concat(c.anyG('H')?['住宅得依需要增設到每戶一輛']:[]),
   note:'地上樓地板若含機電等可扣除面積，實際數量會再少一些；桃園多數計畫區土管另訂較高標準'};});
rule('p60','停車與防空',DS,'60','車位與車道',c=>{
  const big=c.site!=null&&c.site>=1500;
  const has=(c.park&&c.park.n>0)||c.B>0;
  if(!has) return {on:false,why:'本案無法定車位，也未設地下層'};
  return {on:true,why:'設有停車空間時',
   calc:[['車位','2.5 × 5.5 m（室內 1/5 車位得寬減 20cm）'],['車道','單車道 3.5 m／雙車道 5.5 m；坡度 ≤1:6；內側曲線半徑 ≥5 m'],['停車樓層淨高','2.1 m 以上']],
   req:['服務車位達 50 輛以上者，第 50 輛至出入口及出入口至道路間為雙車道（進出分設單向者除外）'].concat(big?[`基地 ${m2(c.site)} ≥ 1,500㎡：設在地面層以外的停車空間應設汽車坡道`]:[]).concat(['每輛停車空間換算容積的樓地板面積最大 40㎡','預留電動車充電設備的裝設空間（第 62 條）'])};});
rule('p141','停車與防空',DS,'141','防空避難設備',c=>{
  let on,why;
  if(c.anyG('A-1','B-1')){on=true;why='戲院、歌廳、舞廳、演藝場等，按建築面積全部附建';}
  else if(c.allG('D-3','D-4')){return {on:'info',why:'學校依核定容納人數每人 1㎡ 整體規劃',req:['居室任一點到避難設備步行距離 ≤300m']};}
  else if(c.pub){on=c.F>=5;why=`供公眾使用建築物（${c.pubSrc}），地上 ${c.F} 層 ${on?'≥':'<'} 5 層`;}
  else {on=c.F>=6;why=`非供公眾使用建築物，地上 ${c.F} 層 ${on?'≥':'<'} 6 層`;}
  return {on,why,calc:on?[['應附建面積',m2(c.ba)+'（按建築面積全部附建）'],['固定設備占用上限',m2(c.ba/4)]]:null,
   req:['須位於中央主管建築機關指定的適用地區','面積達 200㎡ 者以兼作停車空間為限','同時申請建照的各棟得集中附建，步行距離 ≤300m'],
   note:'第 140～142、144 條為 2026-07-01 施行的新條文'};});

/* ───── 無障礙 ───── */
rule('a167','無障礙',DS,'167','無障礙設施',c=>{
  const smallSite=c.site!=null&&c.site<150, smallFl=c.typ<100;
  if(!c.pubBldg&&(smallSite||smallFl)) return {on:false,why:smallSite?`非公共建築物且基地 ${m2(c.site)} < 150㎡`:`非公共建築物且每棟每層 ${m2(c.typ)} < 100㎡`,req:['地面層仍應設無障礙通路']};
  if(c.pubBldg&&(smallSite||smallFl)) return {on:true,why:'屬第 170 條公共建築物，小基地、小樓層的例外不適用',req:['依第十章全部檢討無障礙設施']};
  return {on:true,why:'新建建築物原則上都要設；獨棟／連棟自用住宅、小基地另有例外',
   req:['無障礙通路、樓梯、昇降設備、停車位等依「建築物無障礙設施設計規範」',c.anyG('H-2')?'公寓大廈的專有及約定專用部分免設，公共空間仍要':'各項設施種類依第 167-1～167-7 條'],
   note:!c.pubBldg&&c.site==null&&c.typ>=100?'非公共建築物：基地面積未達 150㎡ 也可免設（地面層仍要無障礙通路）；尚未填基地面積':c.anyG('C')?'工廠類（C 類）102 年起新建、增建都要設（營建署 103.07.14 營署建管字第 1030044357 號書函）；用途特殊設置確有困難者，可依第 167 條第 3 項經主管建築機關核准不適用一部或全部':null};});
rule('a170','無障礙',DS,'170','屬「公共建築物」',c=>{
  if(c.allG('C')) return {on:false,why:'工廠類（C 類）不在第 170 條公共建築物範圍（營建署 103.07.14 營署建管字第 1030044357 號書函）',req:['不是公共建築物：可適用第 167 條第 1 項第 3 款的小基地、小樓層例外']};
  if(!c.allG('H-2')) return {on:'info',verify:true,why:`${c.gs.filter(g=>g!=='H-2').join('、')} 組是否列入公共建築物，請查第 170 條附表`};
  const on=c.F>=6||(c.units!=null&&c.units>=50);
  return {on:on?true:(c.units==null?'info':false),verify:true,
   why:c.F>=6?`六層以上的集合住宅（地上 ${c.F} 層）`:c.units==null?'五層以下時看戶數是否達 50 戶；尚未填戶數':`五層以下，${c.units} 戶 ${c.units>=50?'≥':'<'} 50 戶`,
   req:['公共建築物不適用小基地、小樓層的免設例外','五十戶以同一建築執照基地範圍合計','無障礙停車位、廁所盥洗室等數量依第 167-1～167-7 條']};},{});

rule('a167-1','無障礙',DS,'167-1','無障礙通路通達各層（含昇降設備）',c=>{
  if(c.F<2&&c.B<1) return {on:false,why:'單層建築'};
  const exempt=!c.pubBldg&&((c.site!=null&&c.site<150)||c.typ<100);
  if(exempt) return {on:false,why:'依第 167 條第 1 項第 3 款免設無障礙設施（地面層仍要無障礙通路）'};
  const h2=c.allG('H-2');
  return {on:true,why:h2?'住宅、集合住宅：公共部分要有無障礙通路；專有部分免':'居室出入口、無障礙廁所、無障礙停車位等所在樓層都要有無障礙通路通達',
   req:['二層以上有居室（含作業廠房、辦公室、店鋪）時，通常要設無障礙昇降機才能通達；昇降機依建築物無障礙設施設計規範第 4 章','只有非居室（停車、機房、倉儲）的樓層、且未設無障礙設施者，可不必通達','直通樓梯至少一座為無障礙樓梯（第 167-2 條）'],
   note:c.anyG('C')?'工廠：作業廠房屬居室，二層以上有作業廠房就要通達（營建署 102.11.15 營署建管字第 1020071378 號函，見桃園 112 年度第 3 次法規執行疑義會議引述）；生產作業廠房等用途特殊者，可依第 167 條第 3 項報主管建築機關核准不適用':null};});
rule('a167-3','無障礙',DS,'167-3','無障礙廁所盥洗室數量',c=>{
  if(c.allG('H-2')) return {on:false,why:'H-2 住宅、集合住宅不適用本條'};
  const exempt=!c.pubBldg&&((c.site!=null&&c.site<150)||c.typ<100);
  if(exempt) return {on:false,why:'依第 167 條第 1 項第 3 款免設無障礙設施'};
  if(c.anyG('A-1','A-2')) return {on:'info',verify:true,why:'戲院、演藝場、集會堂、車站等（建築設備編第 37 條第七、八類）依大便器數量計算：19 個以下 1 處，20～29 個 2 處，之後每 10 個加 1 處',req:['先依建築設備編第 37 條算出大便器數量']};
  const n=c.F, groups=[]; let k=1;
  for(let a=4;a<=n;a+=3){const b=Math.min(a+2,n);const big=c.typ>500;groups.push([a,b,big]);if(big)k++;}
  const calc=[['1F～'+Math.min(3,n)+'F',`1 處（總樓層數 3 層以下部分，任一樓層）`]];
  for(const [a,b,big] of groups) calc.push([fr(a,b),big?`加 1 處（範圍內有樓層 > 500㎡）`:`不加（範圍內各層 ${m2(c.typ)} 未超過 500㎡）`]);
  calc.push(['合計',`${k} 處（每幢）`]);
  return {on:true,lvl:String(k),why:`地上 ${n} 層；超過 3 層的部分每 3 層為一組，組內有一層超過 500㎡ 才加設`,calc,
   req:['以「幢」計；依建築設備編第 37 條應設衛生設備者才適用','服務範圍不得大於三樓層：只有一處而建築超過 3 層時，位置要讓服務範圍涵蓋得到，建議設在 2F 或 3F 並向建管確認','只作停車使用的地下層不必檢討（營建署 111.11.22 營建管字第 1110819978 號函）'],
   note:n>3&&k===1?'總樓層超過 3 層但各層都未超過 500㎡，表列只要 1 處；「服務範圍不得大於三樓層」與表列數量如何併用，條文未明示，請向主管建築機關確認':null};});

/* ───── 工廠類建築物（第十四章） ───── */
// 第 269 條只適用都市計畫工業區、非都市丁種建築用地內的工廠（窯業用地、農業區等的廠房不適用本章）
rule('i269','工廠類建築物',DS,'269','工廠類建築物（第十四章）適用範圍與基本設施',c=>{
  if(!c.anyG('C')||c.ind!=='factory') return {on:false,why:'非 C 類工廠'};
  const z=c.zoneTxt;
  const isInd=c.urban?/工業區/.test(z):/丁種|丁建/.test(z);
  if(!z) return {on:'info',verify:true,why:`第十四章只適用${c.urban?'都市計畫工業區':'非都市土地丁種建築用地'}內的工廠；尚未填使用分區／使用地（zone 或 land_use）`,
    req:['在工業區（都市計畫）或丁種建築用地（非都市）內：要檢討第 271～276 條（作業廠房單層 ≥150㎡、淨高 ≥2.7m、附屬空間比例、出入口退縮等）','其他分區或使用地（如窯業用地、農業區、住宅區）：本章不適用']};
  if(!isInd) return {on:false,why:`${z}：第 269 條只規定${c.urban?'都市計畫工業區':'非都市土地丁種建築用地'}內的工廠適用第十四章`};
  const fl=c.floorsOf(c.g).length?c.floorsOf(c.g):[1], small=c.typ<150;
  const H=c.H, set=Math.sqrt(H)/2;
  const calc=[['作業廠房單層（第 271 條）',`${m2(c.typ)} ${small?'< 150㎡，不符':'≥ 150㎡'}`],
    ['出入口退縮（第 276 條）',`√${fmt(H)}/2 ≈ ${fmt(set)} m${c.Hest?'（高度為估算）':''}；平均 ≥3 m、最小 ≥1.5 m`]];
  return {on:true,lvl:small?'!':'',why:`${z}內的工廠，適用第十四章（依原獎勵投資條例、原促進產業升級條例、產業創新條例興建，或設廠標準另有規定者除外）`,calc,
   req:['作業廠房單層樓地板 ≥150㎡；150㎡ 以下範圍內不得固定隔間（第 271 條第 1 項）','作業廠房與附屬空間以 1 小時防火時效（含阻熱性）的牆、樓板、防火門窗區劃，並各自通達避難層、地面或樓梯口（第 271 條第 2、3 項）','附屬空間：辦公室與研究室 ≤ 作業廠房 1/5；作業廠房 ≥300㎡ 才可設單身宿舍且 ≤1/3；員工餐廳等福利設施 ≤1/4；合計 ≤2/5（第 272 條）','陽臺面積不能免計建築面積與樓地板面積（第 273 條）','作業廠房淨高（扣樓板與樑）≥2.7 m（第 274 條）','二座以上直通樓梯時，樓梯口直線距離 ≥ 區劃範圍對角線的一半（第 275 條）','出入口自建築線退縮 ≥ 高度平方根的 1/2，平均 ≥3 m、最小 ≥1.5 m（第 276 條）'],
   note:small?'標準層未達 150㎡：在工業區或丁建內，作業廠房單層面積不符第 271 條':null};});

/* ───── 綠建築與能源 ───── */
rule('gr-green','綠建築與能源',DS,'298','基地綠化、基地保水',c=>{
  if(c.site==null) return {on:'info',why:'基地面積超過 300㎡ 的新建建築物適用；尚未填基地面積'};
  const on=c.site>300;
  return {on,why:`基地面積 ${m2(c.site)} ${on?'>':'≤'} 300㎡`,
   req:['綠化：總固碳當量 > 最小綠化面積的 1/2 × 基準值（住宅區等 0.66、商業區及工業區 0.50）（第 302 條）','保水：基地保水指標 > 0.5 × 法定空地比率（第 305 條）','山坡地、地下水位小於 1m 的基地免檢討保水']};});
rule('gr-energy','綠建築與能源',DS,'298','建築物節約能源',c=>{
  const cat=c.anyG('H')?'住宿類':c.anyG('D-3','D-4')?'學校類':c.anyG('A-1','D-1')?'大型空間類':null;
  const on=!!cat||(c.tfa>1000&&!(c.allG('C')&&c.ind==='factory'));
  return {on,why:cat?`${cat}建築物`:c.allG('C')&&c.ind==='factory'&&c.tfa>1000?'作業廠房、機房、非營業用倉庫除外（第 298 條第 3 款第 1 目）':`其他類：地上樓地板 ${m2(c.tfa)} ${on?'>':'≤'} 1,000㎡`,
   req:['外殼節能依第 308-1～312 條及建築物節約能源設計技術規範檢討',cat==='住宿類'?'住宿類：外殼等價開窗率、屋頂及外牆平均熱傳透率、窗平均遮陽係數':'依建築類別檢討外殼耗能指標']};});
rule('gr-water','綠建築與能源',DS,'298','雨水或生活雜排水回收',c=>{
  if(c.allG('F-1')) return {on:false,why:'F-1 組除外'};
  const on=c.total>=10000;
  return {on,why:`總樓地板面積 ${m2(c.total)} ${on?'≥':'<'} 10,000㎡`,
   req:['雨水貯留利用率 > 4%，或生活雜排水回收再利用率 > 30%，擇一（第 316 條）']};});
rule('gr-mat','綠建築與能源',DS,'321','綠建材',c=>({
  on:c.pub, why:c.pub?'供公眾使用建築物':'非供公眾使用建築物（經內政部認定者除外）',
  req:['室內裝修材料、樓地板面材料及窗：綠建材使用率 ≥60%','戶外地面（扣除車道、消防救災活動空間等）：≥20%']}));
rule('gr-pv','綠建築與能源',PV,'3','太陽光電發電設備',c=>{
  const big=c.ba>=1000;
  if(c.allG('H','G-3')) return {on:big?'info':false,why:big?`建築面積 ${m2(c.ba)} ≥ 1,000㎡，但 H 類與 G-3 的施行日期尚待公告`:`建築面積 ${m2(c.ba)} < 1,000㎡`,
    req:['施行後：每 20㎡ 建築面積設置 1 瓩'],calc:big?[['施行後應設容量',fmt(c.ba/20)+' 瓩']]:null};
  if(c.allG('E','I')) return {on:false,why:'E、I 類不在適用範圍'};
  return {on:big,why:`建築面積 ${m2(c.ba)} ${big?'≥':'<'} 1,000㎡（2026-08-01 施行）`,
   calc:big?[['應設容量',fmt(c.ba/20)+' 瓩（每 20㎡ 一瓩）']]:null,
   req:['受光條件不足者，得憑發電量模擬評定報告免設（桃園基準：每瓩年發電 543 度）']};});

/* ───── 消防設備 ───── */
rule('f15','消防設備',FS,'15','室內消防栓',c=>{
  const thr5=f=>{const x=c.fc(c.fg[f]);return x.k==='甲'&&x.m===1?300:500;};
  let hit=[],why;
  if(c.F>=6){hit=c.typ>=150?[...Array(c.F).keys()].map(i=>i+1):[];why=`6 層以上建築物，任一層 ${m2(c.typ)} ${hit.length?'≥':'<'} 150㎡（第 1 項第 2 款）`;}
  else {for(let f=1;f<=c.F;f++) if(c.typ>=thr5(f)) hit.push(f); why=`5 層以下建築物：甲類第 1 目任一層 ≥300㎡、其他場所任一層 ≥500㎡（學校教室 1,400㎡）；本案每層 ${m2(c.typ)}（第 1 項第 1 款）`;}
  const tb=c.anyG('A-1','B-1')?100:150, b=c.B>0&&c.b1>=tb;
  if(b) why+=`；地下層 ${m2(c.b1)} ≥ ${tb}㎡（第 1 項第 4 款）`;
  return {on:hit.length>0||b,why,calc:[['場所分類',c.klassTxt]],
   req:['已設自動撒水、水霧、泡沫等設備的有效範圍內得免設'],note:c.anyG('D-3','D-4')&&c.F<=5?'學校教室為任一層 1,400㎡':null};});
rule('f17','消防設備',FS,'17','自動撒水設備',c=>{
  const items=[], fl=new Set();
  if(c.high){items.push('高層建築物：全棟（第 8 款）');for(let f=1;f<=c.F;f++)fl.add(f);}
  if(c.F>=11&&(c.hasJia)){items.push(`11 層以上建築物供甲類場所${c.mixed?'（複合用途戊類第 1 目）':''}使用：全棟（第 4 款）`);for(let f=1;f<=c.F;f++)fl.add(f);}
  if(c.F>=11&&c.typ>=100){const a=[];for(let f=11;f<=c.F;f++){a.push(f);fl.add(f);}items.push(`${fr(11,c.F)}：11 層以上樓層面積 ${m2(c.typ)} ≥ 100㎡（第 2 款）`);}
  const f1=[],f2=[];for(let f=1;f<=Math.min(10,c.F);f++){const x=c.fc(c.fg[f]);if(x.k==='甲'&&x.m===1&&c.typ>=300)f1.push(f);else if((x.k==='甲'||(x.k==='乙'&&x.m===1))&&c.typ>=1500)f2.push(f);}
  if(f1.length){items.push(`${span(f1.map(f=>f+'F'))}：甲類第 1 目樓層面積 ≥300㎡（第 1 款）`);f1.forEach(f=>fl.add(f));}
  if(f2.length){items.push(`${span(f2.map(f=>f+'F'))}：甲類其他目或車站樓層面積 ≥1,500㎡（第 1 款）`);f2.forEach(f=>fl.add(f));}
  if(c.mixed&&c.hasJia&&c.jiaArea>=3000){items.push(`複合用途中甲類場所合計約 ${m2(c.jiaArea)} ≥3,000㎡：甲類場所樓層（第 5 款）`);c.jiaFloors.forEach(f=>fl.add(f));}
  if(c.B>0&&c.hasJia&&c.b1>=1000) items.push(`地下層供甲類場所使用且 ${m2(c.b1)} ≥1,000㎡（第 3 款，請確認地下層用途）`);
  const care=c.anyG('F-1','F-2','H-1');
  const on=items.length>0;
  return {on:on?true:(care?'info':false),lvl:on?(fl.size>=c.F?'all':'part'):'',
   why:on?items.join('；'):'未達各款門檻'+(c.hasJia?'（甲類第 1 目 10 層以下樓層 300㎡、其他甲類 1,500㎡）':''),
   calc:[['場所分類',c.klassTxt]].concat(on&&fl.size?[['設置樓層',fl.size>=c.F?'全棟':span([...fl].sort((a,b)=>a-b).map(f=>f+'F'))]]:[]),
   req:on?['設水霧、泡沫等其他滅火設備的範圍得免設']:[],
   note:care?'長期照顧機構（住宿式等）、老人福利機構（長照、養護、失智、安養）、護理之家、照顧失能者的身心障礙機構不論面積都要設（第 9 款；未達 1,000㎡ 可用水道連結型）':null};});
rule('f19','消防設備',FS,'19','火警自動警報、緊急廣播',c=>{
  const why=[];let on=false;
  if(c.F>=11){on=true;why.push('11 層以上建築物（第 3 款）');}
  else if(c.F>=6){if(c.typ>=300){on=true;}why.push(`6～10 層建築物，任一層 ${m2(c.typ)} ${c.typ>=300?'≥':'<'} 300㎡（第 2 款）`);}
  else {const t=f=>{const x=c.fc(c.fg[f]);return x.k==='甲'||(x.k==='乙'&&x.m===12)?300:500;};const hit=[];for(let f=1;f<=c.F;f++) if(c.typ>=t(f)) hit.push(f);
    if(hit.length) on=true; why.push(`5 層以下：甲類任一層 ≥300㎡、其他任一層 ≥500㎡；本案每層 ${m2(c.typ)}${hit.length?`，${span(hit.map(f=>f+'F'))} 達門檻`:''}（第 1 款）`);}
  if(!on&&c.B>0){const t=c.anyG('A-1','B-1','B-3')?100:300;if(c.b1>=t){on=true;why.push(`地下層 ${m2(c.b1)} ≥ ${t}㎡（第 4 款）`);}}
  if(!on&&c.mixed&&c.hasJia&&c.total>=500&&c.jiaArea>=300){on=true;why.push(`複合用途總樓地板 ${m2(c.total)} ≥500㎡ 且甲類合計約 ${m2(c.jiaArea)} ≥300㎡（第 5 款）`);}
  if(!on&&!c.mixed&&c.hasJia&&c.jiaArea>=300){on=true;why.push(`供甲類場所使用，總樓地板約 ${m2(c.jiaArea)} ≥ 300㎡（第 6 款）`);}
  const care=c.anyG('F-1','F-2','H-1');
  return {on:on?true:(care?'info':false),why:why.join('；'),calc:[['場所分類',c.klassTxt]],
   req:['設火警自動警報設備的建築物，同時要設緊急廣播設備（第 22 條）','設有密閉型撒水頭的自動撒水設備者，有效範圍內可免設（甲類、高層、地下建築物除外）'],
   note:care?'長照、安養、護理之家等不論面積都要設（第 7 款）':null};});
rule('f25','消防設備',FS,'25','避難器具',c=>({
  on:c.F>=2, why:c.F>=2?'避難層及 11 層以上樓層除外，各樓層選設':'僅一層',
  calc:c.F>=2?[[fr(2,Math.min(c.F,10)),'緩降機、避難梯、救助袋等擇設']]:null,
  req:['構造設施上無避難逃生障礙，經認可者得免']}));
rule('f26','消防設備',FS,'26','連結送水管',c=>{
  const on=c.F>=7||((c.F===5||c.F===6)&&c.total>=6000);
  return {on,why:c.F>=7?`地上 ${c.F} 層 ≥ 7 層`:(c.F>=5?`5、6 層建築物，總樓地板 ${m2(c.total)} ${on?'≥':'<'} 6,000㎡`:'未達 5 層'),req:[]};});
rule('f27','消防設備',FS,'27','消防專用蓄水池',c=>{
  const a=c.site!=null&&c.site>=20000&&c.typ>=1500, b=c.H>31&&c.total>=25000;
  return {on:a||b,why:b?`高度 ${c.H}m 超過 31m 且總樓地板 ${m2(c.total)} ≥ 25,000㎡`:a?'基地 ≥20,000㎡ 且任一層 ≥1,500㎡':`未達（高度超過 31m 且總樓地板 ≥25,000㎡；或基地 ≥20,000㎡ 且任一層 ≥1,500㎡）`,req:[]};});
rule('f28','消防設備',FS,'28','排煙設備（消防）',c=>{
  const sp=c.high||c.F>=15||c.B>=3, el=c.F>10&&c.typ*(c.F-10)>=500;
  const jia=c.jiaArea>=500;
  const on=sp||el||jia;
  return {on,why:on?[sp||el?`設有${[sp?'特別安全梯':'',el?'緊急昇降機間':''].filter(Boolean).join('、')}`:'',jia?`供甲類場所使用，樓地板面積合計約 ${m2(c.jiaArea)} ≥ 500㎡`:''].filter(Boolean).join('；'):'未設特別安全梯或緊急昇降機間；居室另看有效通風面積',
   req:['特別安全梯排煙室、緊急昇降機間應設排煙設備','100㎡ 以上居室，天花板下 80cm 內有效通風面積未達 2% 者也要設']};});
rule('f29','消防設備',FS,'29','緊急電源插座',c=>({on:c.F>=11,why:`地上 ${c.F} 層 ${c.F>=11?'≥':'<'} 11 層`,calc:c.F>=11?[['範圍','11 層以上建築物之各樓層、緊急昇降機間']]:null,req:[]}));
rule('f30','消防設備',FS,'30','無線電通信輔助設備',c=>{
  const a=c.H>=100, b=c.B>=4&&c.bsum>=3000;
  return {on:a||b,why:a?`樓高 ${c.H}m ≥ 100m`:b?`地下 ${c.B} 層且地下合計 ${m2(c.bsum)} ≥ 3,000㎡`:'未達（樓高 ≥100m；或地下 4 層以上且地下合計 ≥3,000㎡）',req:['設於地下層']};});

/* ───── 桃園地方規定 ───── */
rule('t-struct','桃園地方規定',TY_STRUCT,'2','特殊結構委託審查',c=>{
  const a=c.high, b=c.B>3, d=c.B*3.5+2;
  const on=a||b||d>15;
  return {on:on?true:(c.B===3?'info':false),lvl:on?'y':'',
   why:a?`高度 ${c.H}m 或 ${c.F} 層，達 50m／16 層`:b?`地下 ${c.B} 層，超過 3 層`:d>15?`地下 ${c.B} 層，開挖深度估約 ${fmt(d)}m，超過 15m`:c.B===3?'地下 3 層：含基礎總深度若超過 15m 就要送審':'未達 50m／16 層，地下未超過 3 層',
   req:['建築工程放樣前，檢具審查通過的鑽探報告、結構計算書及圖說報備','另有：RC 跨距 ≥15m、鋼骨跨距 ≥20m、隔震或消能設計、活動斷層或地質敏感區、擋土高度超過 9m','開挖邊界與基地境界線的最小距離大於開挖深度者，地下深度一款不適用']};});
rule('t-green','桃園地方規定',TY_GREEN,'4','桃園市建築基地綠化',c=>{
  if(c.site==null) return {on:'info',why:'適用全市建築基地；填入基地面積可試算'};
  const open=Math.max(0,c.site-c.ba), k2=c.site>=1500;
  const calc=k2?[['綠覆面積',`≥ ${m2(open/5)}（法定空地約 ${fmt(open)}㎡ 的 1/5）`],['喬木',`≥ ${Math.max(1,Math.ceil(open/100))} 株（每 100㎡ 法定空地一株）`]]:[['綠覆面積',`≥ ${m2(open/6)}（法定空地約 ${fmt(open)}㎡ 的 1/6）`]];
  return {on:true,lvl:k2?'2':'3',why:k2?`基地 ${m2(c.site)} ≥ 1,500㎡，屬第二類（住宅區、商業區）`:`基地 ${m2(c.site)} < 1,500㎡，屬第三類`,calc,
   req:(k2?['臨建築線側設圍牆者，透空率 ≥40%']:[]).concat(['採綜合設計（開放空間獎勵）者屬第一類：綠覆率 1/4、每 50㎡ 一株','土管要求法定空地 1/2 綠化者，從其規定']),
   note:'此處法定空地以「基地面積－建築面積」估算；工業區的第二類門檻為 10,000㎡'};});
rule('t-ud','桃園地方規定',TY_UD,'3','都市設計審議',c=>({
  on:'info',why:'與量體無直接門檻，依基地所在計畫區與容積來源判斷',
  req:['都市計畫書規定應經都審的地區','增加的建築容積超過基準容積 50%（容積移轉＋獎勵合計）','公有建築物總樓地板 ≥4,000㎡、私立學校 ≥6,000㎡']}));

function solve(inp){
  const c=context(inp);
  const out=R.filter(r=>c.ty||r.cat!=='桃園地方規定').map(r=>{
    let res; try{res=r.fn(c)||{on:false};}catch(e){res={on:false,why:'計算錯誤：'+e.message};}
    return {id:r.id,cat:r.cat,law:r.law,art:typeof r.art==='function'?r.art(c):r.art,title:r.title,...res};});
  return {c,out};
}
function sig(res){const m={};res.out.forEach(o=>{m[o.id]=(o.on===true?'1':o.on==='info'?'i':'0')+'|'+(o.lvl||'');});return m;}

/* 門檻雷達：把單一輸入往上／往下推到下一個門檻，看哪些規則改變 */
const BP={F:[2,3,5,6,7,8,10,11,15,16,25],B:[1,2,3,4],
  typ:[100,150,200,240,300,400,500,1000,1500],
  H:[20,31,50,90,100], units:[50], site:[150,300,1500,20000]};
function radar(inp){
  const base=solve(inp), s0=sig(base), c=base.c, items=[];
  const diff=(patch,label,dir)=>{
    const r=solve({...inp,...patch}), s1=sig(r), ch=[];
    r.out.forEach(o=>{ if(s0[o.id]!==s1[o.id]){
      const was=s0[o.id][0], now=s1[o.id][0];
      const kind=(was!=='1'&&now==='1')?'add':(was==='1'&&now!=='1')?'drop':'chg';
      if(kind==='chg'&&was===now&&!o.lvl&&!s0[o.id].split('|')[1]) return;
      ch.push({id:o.id,title:o.title,art:o.art,law:o.law,kind});}});
    if(ch.length) items.push({label,dir,ch});
  };
  // 樓層
  const upF=BP.F.find(v=>v>c.F), dnF=[...BP.F].reverse().find(v=>v<=c.F);
  if(upF) diff({F:upF,tfa:inp.tfa?(+inp.tfa)/c.F*upF:'',H:inp.H?(+inp.H)/c.F*upF:''},`地上加到 ${upF} 層`,'up');
  if(dnF&&dnF-1>=1) diff({F:dnF-1,tfa:inp.tfa?(+inp.tfa)/c.F*(dnF-1):'',H:inp.H?(+inp.H)/c.F*(dnF-1):''},`地上減到 ${dnF-1} 層`,'dn');
  const upB=BP.B.find(v=>v>c.B); if(upB) diff({B:upB},`地下加到 ${upB} 層`,'up');
  if(c.B>0) diff({B:c.B-1},`地下減到 ${c.B-1} 層`,'dn');
  // 標準層面積
  const upT=BP.typ.find(v=>v>=c.typ&&!(v===c.typ)), dnT=[...BP.typ].reverse().find(v=>v<c.typ);
  const tryT=(v,lab,dir)=>diff({typ:v,tfa:inp.tfa?(+inp.tfa)/c.typ*v:'',ba:inp.ba?(+inp.ba)/c.typ*v:''},lab,dir);
  if(upT!=null&&c.typ>0) tryT(upT+1,`標準層放大到超過 ${fmt(upT)}㎡`,'up');
  if(dnT!=null) tryT(dnT-1,`標準層縮到 ${fmt(dnT)}㎡ 以下`,'dn');
  // 高度（填了實際高度才準；未填時以每層 3.3m 估，高層判斷不採估值）
  const upH=BP.H.find(v=>v>c.H), dnH=[...BP.H].reverse().find(v=>v<=c.H);
  if(upH) diff({H:upH+0.1},`高度提高到超過 ${upH} m${c.Hest?'（目前為估值）':''}`,'up');
  if(dnH) diff({H:dnH-0.1},`高度降到 ${dnH} m 以下`,'dn');
  // 戶數（五層以下集合住宅 50 戶）
  if(c.anyG('H-2')&&c.F<=5){ if(c.units==null||c.units<50) diff({units:50},'戶數增加到 50 戶','up'); else diff({units:49},'戶數減到 49 戶','dn'); }
  // 基地面積
  if(c.site!=null){const up=BP.site.find(v=>v>c.site), dn=[...BP.site].reverse().find(v=>v<=c.site);
    if(up) diff({site:up+0.1},`基地面積放大到超過 ${fmt(up)}㎡`,'up');
    if(dn) diff({site:dn-0.1},`基地面積縮到 ${fmt(dn)}㎡ 以下`,'dn');}
  return items;
}
export {solve,radar,GROUPS,CATS,R};
