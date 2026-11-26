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

const CATS=['構造與防火','防火區劃與內裝','避難逃生','昇降設備','高層建築專章','一般設計','停車與防空','無障礙','綠建築與能源','消防設備','桃園地方規定'];

const n0=v=>(v===''||v==null||isNaN(+v))?null:+v;
const fmt=v=>{ if(v==null) return '—'; const r=Math.round(v*100)/100; return r.toLocaleString('en-US'); };
const m2=v=>fmt(v)+' ㎡';
const inG=(g,...l)=>l.some(x=>x.length===1?g[0]===x:g===x);

function context(inp){
  const c={};
  c.g=inp.group||'H-2'; c.cls=c.g[0];
  c.F=Math.max(1,n0(inp.F)||1); c.B=Math.max(0,n0(inp.B)||0);
  c.typ=n0(inp.typ)||0;                       // 標準層（最大單層）樓地板面積
  c.site=n0(inp.site);                        // 基地面積
  c.ba=n0(inp.ba)??c.typ;                     // 建築面積
  c.tfa=n0(inp.tfa)??c.typ*c.F;               // 地上總樓地板
  c.b1=c.B>0?(n0(inp.b1)??(c.site?Math.round(c.site*0.8):c.typ)):0; // 地下單層面積
  c.bsum=c.b1*c.B; c.total=c.tfa+c.bsum;
  c.vfaEst=n0(inp.vfa)==null; c.vfa=n0(inp.vfa)??c.tfa;   // 容積樓地板（第 162 條），未填以地上樓地板估
  c.Hest=n0(inp.H)==null; c.H=n0(inp.H)??Math.round((c.F*3.3+0.9)*10)/10;
  c.units=n0(inp.units);
  c.urban=inp.urban!==false; c.zone=inp.zone||'res';
  c.bcr=n0(inp.bcr);
  c.high=c.F>=16||(!c.Hest&&c.H>=50);
  c.nearHigh=!c.high&&c.Hest&&c.H>=45;
  // 供公眾使用：H-2 以六層以上集合住宅認定；其餘類組預設為是（可手動覆寫）
  c.pubAuto=c.g==='H-2'?c.F>=6:(c.g==='C-2'||c.g==='G-2'||c.g==='G-3'||c.g==='H-1'?c.F>=6||c.tfa>=500:true);
  c.pub=inp.pub==='yes'?true:inp.pub==='no'?false:c.pubAuto;
  c.pubBldg=c.g==='H-2'?(c.F>=6||(c.units!=null&&c.units>=50)):true; // 第 170 條公共建築物（非 H-2 先保守視為是）
  // §69 是否「應」為防火構造
  const s2=c.F>=2?c.typ:0; let need=false, why='';
  if(c.cls==='A'){need=true;why='A 類全部';}
  else if(c.cls==='B'){need=c.F>=3||c.total>=3000||s2>=500;why='B 類：三層以上、總樓地板 ≥3,000㎡，或二層部分 ≥500㎡';}
  else if(c.cls==='C'){need=c.F>=3||c.total>=1500;why='C 類：三層以上或總樓地板 ≥1,500㎡（工廠除外）';}
  else if(c.cls==='D'||c.cls==='E'||c.cls==='G'){need=c.F>=3||c.total>=2000;why=c.cls+' 類：三層以上或總樓地板 ≥2,000㎡';}
  else if(c.cls==='F'||c.cls==='H'){need=c.F>=3||s2>=300;why=c.cls+' 類：三層以上，或二層面積 ≥300㎡';}
  else {need=true;why='I 類依危險品種類另定，先以防火構造檢討';}
  c.fpNeed=need; c.fpWhy=why; c.fp=need||inp.fireproof!==false;
  c.fpConflict=need&&inp.fireproof===false; // 使用者填非防火構造，但第 69 條要求防火構造：以防火構造檢討並提醒
  c.park=(()=>{let f,ru,rn;if(inG(c.g,'H')){f=500;ru=150;rn=300;}else if(inG(c.g,'A','B-1','B-2','B-3','G','D-1')){f=300;ru=150;rn=250;}else if(inG(c.g,'B-4','D-2','E','F-1','F-2')){f=500;ru=200;rn=350;}else if(c.g==='I'){return null;}else{f=500;ru=250;rn=350;}const r=c.urban?ru:rn;return {free:f,rate:r,n:c.tfa>f?Math.ceil((c.tfa-f)/r):0};})();
  c.klass=inG(c.g,'A-1','B-1','B-2','B-3','B-4','F-1','F-2','F-3','D-1')?'甲':'乙'; // 消防分類（近似）
  return c;
}

/* 各樓層標籤：由頂層往下 */
function levels(c){const a=[];for(let i=c.F;i>=1;i--)a.push(i+'F');for(let i=1;i<=c.B;i++)a.push('B'+i);return a;}
const ex961=c=>c.F>=3&&c.F<=5&&c.fp&&inG(c.g,'H-2','D-3','D-4');
const fr=(a,b)=>a===b?a+'F':`${a}F～${b}F`;
function span(a){return a.length?(a.length===1?a[0]:a[0]+'～'+a[a.length-1]):'';}

const R=[];
const rule=(id,cat,law,art,title,fn,opt={})=>R.push({id,cat,law,art,title,fn,...opt});

/* ───── 構造與防火 ───── */
rule('fp69','構造與防火',DS,'69','應為防火構造',c=>({
  on:c.fpNeed, lvl:c.fpNeed?'need':'',
  why:c.fpNeed?`${c.fpWhy}；本案地上 ${c.F} 層、二層面積約 ${m2(c.F>=2?c.typ:0)}`:`未達門檻（${c.fpWhy}）`,
  req:['主要構造（柱、梁、承重牆、樓地板、屋頂）須為防火構造','後續防火時效、區劃、防火間隔都以防火構造為前提'],
  note:c.fpConflict?'輸入填「非防火構造」，但依第 69 條本案應為防火構造；以下各條一律以防火構造檢討':c.cls==='C'?'C 類的 1,500㎡ 門檻不含工廠（工廠看三層以上；作業廠房合計超過 50㎡ 者主要構造須用不燃材料）；變電所、汽車修理場等為 150㎡，請對照第 69 條附表':null}));
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
  const h2=c.g==='H-2', k=h2?2:1;
  return {on:c.F>=11, why:`地上 ${c.F} 層 ${c.F>=11?'≥':'<'} 11 層`,
   calc:c.F>=11?[[fr(11,c.F),`標準層 ${m2(c.typ)}，${c.typ>100*k?'需再區劃':'單層未超過基本區劃面積'}`]]:null,
   req:[`基本：每 ${100*k}㎡ 區劃${h2?'（H-2 得放寬為 200㎡）':''}`,`1.2m 以上牆面及天花板用耐燃一級：每 ${200*k}㎡`,'牆面及天花板（含底材）全用耐燃一級：每 500㎡','設有效自動滅火設備，面積得免計二分之一；防火門窗須 1 小時阻熱性']};});
rule('z88','防火區劃與內裝',DS,'88','內部裝修材料限制',c=>{
  const h2=c.g==='H-2';
  if(h2) return {on:c.F>=11,verify:true,why:c.F>=11?'H-2 表列居室無一般限制，但 11 層以上部分仍受限':'H-2 表列居室無一般限制（無窗戶居室、使用燃燒設備的房間仍受限）',
    req:['11 層以上部分：依防火區劃面積決定耐燃等級（200㎡ 內區劃者耐燃二級以上、500㎡ 內區劃者耐燃一級）','通達地面的走廊及樓梯用耐燃一級']};
  return {on:true,verify:true,why:`${c.g} 組列於第 88 條附表`,
    req:['居室：耐燃三級以上（部分類組為二級）；通達地面的走廊及樓梯：耐燃二級以上','每 100㎡ 以 1 小時時效區劃，或設自動滅火＋排煙設備者得免（B-1、B-2、B-3、I 除外）','11 層以上部分、地下層、無窗戶居室另有較嚴規定']};});

/* ───── 避難逃生 ───── */
rule('e90','避難逃生',DS,'90','直通樓梯在避難層的出入口',c=>{
  if(c.F+c.B<2) return {on:false,why:'單層建築，無直通樓梯'};
  const two=c.F>=6||(inG(c.g,'A','B','D','E','F','G','H-1')&&c.tfa>500);
  return {on:true,lvl:two?'two':'one',why:two?(c.F>=6?`地上 ${c.F} 層 ≥ 6 層`:`${c.g} 組使用面積 ${m2(c.tfa)} > 500㎡`):'未達 6 層，只檢討出入口尺寸',
   req:two?['避難層開設二處以上不同方向的出入口（梯出口直接開向道路或避難用通路者除外）','至少一處直通道路，其餘可開向寬 1.5m 以上避難通路','每處出入口寬 ≥1.2m、高 ≥1.8m']:['開向屋外的出入口寬 ≥1.2m、高 ≥1.8m']};});
rule('e92','避難逃生',DS,'92','走廊寬度',c=>{
  let a,b,why;
  if(inG(c.g,'D-3','D-4','D-5')){a=2.4;b=1.8;why='教室使用部分';}
  else if(c.typ>=200||c.g==='F-1'){a=1.6;b=1.2;why=c.g==='F-1'?'F-1 組':`同層居室面積約 ${m2(c.typ)} ≥ 200㎡（地下層為 100㎡）`;}
  else {a=1.2;b=1.2;why=`同層居室面積約 ${m2(c.typ)} < 200㎡`;}
  return {on:true,lvl:a+'',why,calc:[['兩側有居室的走廊',a+' m 以上'],['其他走廊',b+' m 以上']],
   req:c.fp?['連接直通樓梯的走廊牆壁及樓地板：1 小時防火時效、耐燃一級裝修','走廊地板坡度不得超過 1/10，不得設臺階']:['走廊地板坡度不得超過 1/10，不得設臺階'],
   note:'此處以標準層面積近似「同層居室樓地板面積」'};});
rule('e93','避難逃生',DS,'93','步行距離',c=>{
  if(c.F+c.B<2) return {on:false,why:'單層建築'};
  let d=inG(c.g,'A','B-1','B-2','B-3','D-1')?30:c.cls==='C'?70:50;
  const calc=[];
  if(!c.fp){d=Math.min(d,30);calc.push(['各樓層','30 m 以下（非防火構造）']);}
  else{calc.push([c.F>=15?`14F 以下`:'各樓層',d+' m 以下']);
    if(c.F>=15&&d<=50) calc.push([fr(15,c.F),(d===30?20:40)+' m 以下']);}
  if(c.g==='H-2') calc.push(['複層式住宅無出入口樓層','40 m 以下']);
  return {on:true,lvl:(c.F>=15?'15':'')+d,why:'任何建築物避難層以外各樓層都要有直通樓梯',calc,
   req:['居室任一點到樓梯口的實際可行距離（非直線）','算到直通樓梯第一階；安全梯可算到梯間防火門','避難層：梯口到屋外出入口同樣受此距離限制（第 94 條）']};});
rule('e95','避難逃生',DS,'95','二座以上直通樓梯',c=>{
  const k=c.fp?1:0, T=(a,b)=>k?a:b;
  let thr=null,txt='';
  if(c.g==='A-1'){thr=0;txt='A-1 組，避難層以外樓層一律';}
  else if(c.g==='F-1'){thr=null;txt=`F-1 組：該層病房面積超過 ${T(100,50)}㎡`;}
  else if(inG(c.g,'H-1','B-4','H-2')){thr=T(240,100);txt=`${c.g}：該層樓地板面積超過 ${thr}㎡`;}
  else {thr=c.F===2?T(400,200):T(240,100);txt=`避難層直上層超過 ${T(400,200)}㎡、其他任一層超過 ${T(240,100)}㎡`;}
  const byArea=thr!=null&&c.typ>thr&&c.F>=2, by8=c.F>=8, byB=c.B>0&&c.b1>=200;
  const parts=[];
  if(byArea) parts.push(`2F 以上各層（標準層 ${m2(c.typ)} > ${thr}㎡）`);
  else if(by8) parts.push(`${fr(8,c.F)}（八層以上之樓層）`);
  if(byB) parts.push(`地下層（單層 ${m2(c.b1)} ≥ 200㎡）`);
  const on=parts.length>0;
  return {on,lvl:(byArea?'A':by8?'8':'')+(byB?'B':''),
   why:on?parts.join('；'):`未達 8 層，且${txt.replace('超過','未超過')}`,
   calc:on?parts.map(p=>[p.split('（')[0],'2 座以上直通樓梯']):null,
   req:['二座梯的步行路徑重複部分，不得大於最大容許步行距離的 1/2','本條面積可扣除機械房、直通樓梯間、電梯間、室內停車等（第 89 條第 5 款）；此處以標準層全部面積試算，偏嚴'],
   note:c.g==='F-1'?'F-1 另看病房面積，請自行確認':(by8&&!byArea&&c.typ<=thr?'8 層以上樓層才需二座；7 層以下若各層未超過面積門檻可為一座':null)};});
rule('e96','避難逃生',DS,'96','安全梯／特別安全梯',c=>{
  const sp=c.F>=15||c.B>=3, sf=c.F>=6||c.B>=2, one=c.F>=3;
  if(!one&&!sf&&!sp) return {on:false,why:`地上 ${c.F} 層、地下 ${c.B} 層，未達 3 層`};
  const ex=ex961(c);
  if(ex&&!sf) return {on:false,why:`3～5 層防火構造，僅供 ${c.g==='H-2'?'住宅':'校舍'}使用，依第 96-1 條免改設安全梯`};
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
  if(!inG(c.g,'H-2','D-3','D-4')) return {on:'info',why:`${c.g} 組：只有一棟一戶的獨棟或連棟住宅，一、二樓兼作 D-5、G-2、G-3 並以 1 小時區劃分隔，且非供公眾使用時才適用`};
  return {on:true,why:`地上 ${c.F} 層防火構造，僅供 ${c.g==='H-2'?'住宅、集合住宅':'校舍'}使用`,
   req:['得免受第 96 條第一款（3～5 層至少一座安全梯）的限制','整棟只要混入其他用途（例如一樓店面）就不適用，改依第 96 條設安全梯；一棟一戶兼作 D-5、G-2、G-3 者另依本條第二款'],
   note:c.B>=2?'地下 2 層以上部分仍依第 96 條第二款設安全梯，本條只免除 3～5 層那一款':null};});
rule('e99','避難逃生',DS,'99','屋頂避難平臺',c=>{
  const on=c.F>=5&&inG(c.g,'A-1','B-1','B-2');
  return {on,why:on?`${c.g} 組設在 5 層以上樓層`:inG(c.g,'A-1','B-1','B-2')?'未達 5 層':'僅 A-1、B-1、B-2 組適用',
   calc:on?[['平臺面積合計',`≥ ${m2(c.typ/2)}（5 層以上最大樓地板面積的 1/2）`]]:null,
   req:['任一邊長 ≥6m；以戶外安全梯或特別安全梯通達','通達該樓層的直通樓梯均為戶外安全梯或特別安全梯（第 96 條）']};});
rule('e99-1','避難逃生',DS,'99-1','樓層分二區劃（護理、老人福利等）',c=>{
  const on=inG(c.g,'F-1','F-2','H-1');
  return {on:on?'info':false,why:on?`${c.g} 組若為護理之家、老人福利機構、住宿型精神復健機構、F-2 機構或學校才適用`:'僅 F-1、F-2、H-1 特定機構適用',
   req:['避難層以外樓層分成二個以上區劃，各以走廊連接安全梯','區劃間出入口寬 ≥120cm，防火設備具遮煙性能']};});
rule('e100','避難逃生',DS,'100','排煙設備（技術規則）',c=>{
  const g=inG(c.g,'A-1','B'), on=g&&c.typ>500;
  return {on:on?true:'info',verify:true,
   why:on?`${c.g} 組每層 ${m2(c.typ)} > 500㎡`:'條文沿用舊分類（第一類、第四類、第二類的養老院及兒童福利設施）；無窗戶居室不論類組都要設',
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
  if(c.g==='D-3'){w='1.40';rh=16;rd=26;why='小學校舍';}
  else if(inG(c.g,'D-4','F-1','A-1','B-1')||(c.g==='B-2'&&c.tfa>=1500)){w='1.40';rh=18;rd=26;why='學校、醫院、戲院、商場等';}
  else if(c.typ>200){w='1.20';rh=20;rd=24;why=`每層居室面積約 ${m2(c.typ)} 超過 200㎡`;}
  else {w='0.75';rh=20;rd=21;why='每層居室面積未超過 200㎡';}
  return {on:true,lvl:w,why,calc:[['樓梯及平臺寬',w+' m 以上'],['級高',rh+' cm 以下'],['級深',rd+' cm 以上']],
   req:['進入安全梯的門扇迴轉半徑不得與梯內樓梯寬度的迴轉半徑相交','依第 95、96 條設置的戶外直通樓梯，寬度得減為 90cm'],
   note:c.B>0?'地下層看的是各層「居室」面積，停車空間不算；地下若有超過 200㎡ 的居室，樓梯改用 1.20m':null};});
rule('g38','一般設計',DS,'38','欄杆扶手高度',c=>{
  const strict=inG(c.g,'A-1','A-2','B-2','D-2','D-3','F-3','G-2','H-2');
  const calc=[[c.F>=10?'9F 以下':'各樓層','1.10 m 以上']]; if(c.F>=10) calc.push([fr(10,c.F),'1.20 m 以上']);
  return {on:true,lvl:c.F>=10?'1.2':'1.1',why:'露臺、陽臺、室外走廊、室外樓梯、平屋頂、室內天井',calc,
   req:strict?[`${c.g} 組：欄杆不得有可供直徑 10cm 物體穿越的鏤空，也不得有可攀爬的水平橫條`]:[]};});
rule('g46','一般設計',DS,'46','隔音構造',c=>{
  const h2=c.g==='H-2', p=inG(c.g,'H-1','B-4','F-1');
  if(!h2&&!p) return {on:false,why:'僅住宅、寄宿舍、旅館、醫院病房適用'};
  return {on:true,why:h2?'集合住宅的分戶牆、分戶樓板':'臥室、客房、病房的分間牆',
   req:h2?['分戶牆：空氣音隔音 Rw ≥50dB，或 RC 含粉刷 ≥15cm 等（第 46-4 條）','分戶樓板：衝擊音 Ln,w ≤58dB，或 RC 樓板 ≥15cm 加緩衝材（第 46-6 條）','昇降機道與居室相鄰的牆：Rw ≥55dB，或 RC 含粉刷 ≥20cm']
     :['分間牆：空氣音隔音 Rw ≥45dB，或 RC 含粉刷 ≥10cm 等（第 46-3 條）','昇降機道與居室相鄰的牆：Rw ≥55dB，或 RC 含粉刷 ≥20cm']};});
rule('g164','一般設計',DS,'164-1','住宅樓層高度與挑空',c=>{
  if(!inG(c.g,'H-2')) return {on:false,why:'僅住宅、集合住宅類適用'};
  return {on:true,why:'住宅、集合住宅',calc:[['地面一層','4.2 m 以下'],['其餘各層','3.6 m 以下']],
   req:['挑空每戶限一處，設於客廳或客餐廳上方，每處 ≥15㎡，合計不超過允建總容積樓地板面積 1/10','挑空樓層高度 ≤6m','夾層只能在地面層或最上層擇一設置']};});
rule('g20','一般設計',EQ,'20','避雷設備',c=>({
  on:c.H>=20, why:`建築物高度 ${c.H}m${c.Hest?'（估）':''} ${c.H>=20?'≥':'<'} 20m`, req:['依建築設備編第一章第五節設置避雷設備']}));
rule('g116','一般設計',DS,'116-1','公共空間安全維護裝置',c=>({
  on:c.pub, why:c.pub?'供公眾使用建築物':'非供公眾使用建築物',
  req:['公共空間依第 116-2 條附表設置監視攝影、緊急求救、警戒探測等裝置','停車空間、車道、電梯車廂、安全梯間、屋頂避難平臺、防災中心等為主要對象']}));

/* ───── 停車與防空 ───── */
rule('p59','停車與防空',DS,'59','法定停車位',c=>{
  let k,free,ru,rn,name;
  if(inG(c.g,'H')){k=2;free=500;ru=150;rn=300;name='第二類（住宅、集合住宅等）';}
  else if(inG(c.g,'A','B-1','B-2','B-3','G','D-1')){k=1;free=300;ru=150;rn=250;name='第一類（集會、商業、辦公等）';}
  else if(inG(c.g,'B-4','D-2','E','F-1','F-2')){k=3;free=500;ru=200;rn=350;name='第三類（旅館、文教、醫院、福利等）';}
  else if(inG(c.g,'C','D-3','D-4','D-5','F-3','F-4')){k=4;free=500;ru=250;rn=350;name='第四類（倉庫、學校、工廠等）';}
  else return {on:'info',why:'I 類屬第五類，由內政部另定'};
  const rate=c.urban?ru:rn, n=c.tfa>free?Math.ceil((c.tfa-free)/rate):0;
  return {on:n>0,lvl:n>0?'y':'',why:`${name}，${c.urban?'都市計畫內':'都市計畫外'}：超過 ${free}㎡ 部分每 ${rate}㎡ 一輛`,
   calc:[['計算面積',m2(c.tfa)+'（地上樓地板）'],['法定車位',n+' 輛'+(n?`　(${fmt(c.tfa)}−${free}) ÷ ${rate}，零數進一`:'')]],
   req:['計算面積不含室內停車空間、法定防空避難設備、騎樓門廊、機械房、變電室、蓄水池、屋頂突出物','都市計畫書或土管另有規定者優先'].concat(k===2?['住宅得依需要增設到每戶一輛']:[]),
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
  if(inG(c.g,'A-1','B-1')){on=true;why='戲院、歌廳、舞廳、演藝場等，按建築面積全部附建';}
  else if(inG(c.g,'D-3','D-4')){return {on:'info',why:'學校依核定容納人數每人 1㎡ 整體規劃',req:['居室任一點到避難設備步行距離 ≤300m']};}
  else if(c.pub){on=c.F>=5;why=`供公眾使用建築物，地上 ${c.F} 層 ${on?'≥':'<'} 5 層`;}
  else {on=c.F>=6;why=`非供公眾使用建築物，地上 ${c.F} 層 ${on?'≥':'<'} 6 層`;}
  return {on,why,calc:on?[['應附建面積',m2(c.ba)+'（按建築面積全部附建）'],['固定設備占用上限',m2(c.ba/4)]]:null,
   req:['須位於中央主管建築機關指定的適用地區','面積達 200㎡ 者以兼作停車空間為限','同時申請建照的各棟得集中附建，步行距離 ≤300m'],
   note:'第 140～142、144 條為 2026-07-01 施行的新條文'};});

/* ───── 無障礙 ───── */
rule('a167','無障礙',DS,'167','無障礙設施',c=>{
  const smallSite=c.site!=null&&c.site<150, smallFl=c.typ<100;
  if(!c.pubBldg&&(smallSite||smallFl)) return {on:false,why:smallSite?`非公共建築物且基地 ${m2(c.site)} < 150㎡`:`非公共建築物且每棟每層 ${m2(c.typ)} < 100㎡`,req:['地面層仍應設無障礙通路']};
  if(c.pubBldg&&c.g==='H-2'&&(smallSite||smallFl)) return {on:true,why:'屬第 170 條公共建築物，小基地、小樓層的例外不適用',req:['依第十章全部檢討無障礙設施']};
  return {on:true,why:'新建建築物原則上都要設；獨棟／連棟自用住宅、小基地另有例外',
   req:['無障礙通路、樓梯、昇降設備、停車位等依「建築物無障礙設施設計規範」',c.g==='H-2'?'公寓大廈的專有及約定專用部分免設，公共空間仍要':'各項設施種類依第 167-1～167-7 條']};});
rule('a170','無障礙',DS,'170','屬「公共建築物」',c=>{
  if(c.g!=='H-2') return {on:'info',verify:true,why:`${c.g} 組是否列入公共建築物，請查第 170 條附表`};
  const on=c.F>=6||(c.units!=null&&c.units>=50);
  return {on:on?true:(c.units==null?'info':false),verify:true,
   why:c.F>=6?`六層以上的集合住宅（地上 ${c.F} 層）`:c.units==null?'五層以下時看戶數是否達 50 戶；尚未填戶數':`五層以下，${c.units} 戶 ${c.units>=50?'≥':'<'} 50 戶`,
   req:['公共建築物不適用小基地、小樓層的免設例外','五十戶以同一建築執照基地範圍合計','無障礙停車位、廁所盥洗室等數量依第 167-1～167-7 條']};},{});

/* ───── 綠建築與能源 ───── */
rule('gr-green','綠建築與能源',DS,'298','基地綠化、基地保水',c=>{
  if(c.site==null) return {on:'info',why:'基地面積超過 300㎡ 的新建建築物適用；尚未填基地面積'};
  const on=c.site>300;
  return {on,why:`基地面積 ${m2(c.site)} ${on?'>':'≤'} 300㎡`,
   req:['綠化：總固碳當量 > 最小綠化面積的 1/2 × 基準值（住宅區等 0.66、商業區及工業區 0.50）（第 302 條）','保水：基地保水指標 > 0.5 × 法定空地比率（第 305 條）','山坡地、地下水位小於 1m 的基地免檢討保水']};});
rule('gr-energy','綠建築與能源',DS,'298','建築物節約能源',c=>{
  const cat=inG(c.g,'H')?'住宿類':inG(c.g,'D-3','D-4')?'學校類':inG(c.g,'A-1','D-1')?'大型空間類':null;
  const on=!!cat||c.tfa>1000;
  return {on,why:cat?`${cat}建築物`:`其他類：地上樓地板 ${m2(c.tfa)} ${on?'>':'≤'} 1,000㎡`,
   req:['外殼節能依第 308-1～312 條及建築物節約能源設計技術規範檢討',cat==='住宿類'?'住宿類：外殼等價開窗率、屋頂及外牆平均熱傳透率、窗平均遮陽係數':'依建築類別檢討外殼耗能指標']};});
rule('gr-water','綠建築與能源',DS,'298','雨水或生活雜排水回收',c=>{
  if(c.g==='F-1') return {on:false,why:'F-1 組除外'};
  const on=c.total>=10000;
  return {on,why:`總樓地板面積 ${m2(c.total)} ${on?'≥':'<'} 10,000㎡`,
   req:['雨水貯留利用率 > 4%，或生活雜排水回收再利用率 > 30%，擇一（第 316 條）']};});
rule('gr-mat','綠建築與能源',DS,'321','綠建材',c=>({
  on:c.pub, why:c.pub?'供公眾使用建築物':'非供公眾使用建築物（經內政部認定者除外）',
  req:['室內裝修材料、樓地板面材料及窗：綠建材使用率 ≥60%','戶外地面（扣除車道、消防救災活動空間等）：≥20%']}));
rule('gr-pv','綠建築與能源',PV,'3','太陽光電發電設備',c=>{
  const big=c.ba>=1000;
  if(inG(c.g,'H','G-3')) return {on:big?'info':false,why:big?`建築面積 ${m2(c.ba)} ≥ 1,000㎡，但 H 類與 G-3 的施行日期尚待公告`:`建築面積 ${m2(c.ba)} < 1,000㎡`,
    req:['施行後：每 20㎡ 建築面積設置 1 瓩'],calc:big?[['施行後應設容量',fmt(c.ba/20)+' 瓩']]:null};
  if(inG(c.g,'E','I')) return {on:false,why:'E、I 類不在適用範圍'};
  return {on:big,why:`建築面積 ${m2(c.ba)} ${big?'≥':'<'} 1,000㎡（2026-08-01 施行）`,
   calc:big?[['應設容量',fmt(c.ba/20)+' 瓩（每 20㎡ 一瓩）']]:null,
   req:['受光條件不足者，得憑發電量模擬評定報告免設（桃園基準：每瓩年發電 543 度）']};});

/* ───── 消防設備 ───── */
rule('f15','消防設備',FS,'15','室內消防栓',c=>{
  const t5=inG(c.g,'A-1','B-1')?300:500, tb=inG(c.g,'A-1','B-1')?100:150;
  const a=c.F>=6?c.typ>=150:c.typ>=t5, b=c.B>0&&c.b1>=tb;
  return {on:a||b,why:(c.F>=6?`6 層以上建築物，任一層 ${m2(c.typ)} ${a?'≥':'<'} 150㎡`:`5 層以下建築物，任一層 ${m2(c.typ)} ${a?'≥':'<'} ${t5}㎡`)+(c.B>0?`；地下層 ${m2(c.b1)} ${b?'≥':'<'} ${tb}㎡`:''),
   req:['已設自動撒水等設備的有效範圍內得免設']};});
rule('f17','消防設備',FS,'17','自動撒水設備',c=>{
  let on=false,why,calc=null,lvl='';
  if(c.high){on=true;lvl='all';why='高層建築物';calc=[['範圍','全棟']];}
  else if(c.F>=11&&c.klass==='甲'){on=true;lvl='all';why='11 層以上建築物供甲類場所使用';calc=[['範圍','供甲類場所使用的部分，及 11 層以上各樓層']];}
  else if(c.F>=11&&c.typ>=100){on=true;lvl='11';why=`11 層以上樓層，樓地板面積 ${m2(c.typ)} ≥ 100㎡`;calc=[['範圍',fr(11,c.F)]];}
  else why=c.F>=11?`11 層以上樓層面積 ${m2(c.typ)} < 100㎡`:'未達 11 層；甲類場所另看各層面積（300／1,500㎡）';
  return {on,lvl,why,calc,req:on?['設水霧、泡沫等其他滅火設備的範圍得免設']:[],note:c.klass==='甲'&&!on?'甲類場所 10 層以下樓層仍可能因面積達 1,500㎡（部分為 300㎡）而要設，請對照條文':null};});
rule('f19','消防設備',FS,'19','火警自動警報、緊急廣播',c=>{
  let on,why; const t=c.klass==='甲'?300:500;
  if(c.F>=11){on=true;why='11 層以上建築物';}
  else if(c.F>=6){on=c.typ>=300;why=`6～10 層建築物，任一層 ${m2(c.typ)} ${on?'≥':'<'} 300㎡`;}
  else {on=c.typ>=t;why=`5 層以下建築物，任一層 ${m2(c.typ)} ${on?'≥':'<'} ${t}㎡`;}
  if(!on&&c.B>0&&c.b1>=300){on=true;why+=`；地下層 ${m2(c.b1)} ≥ 300㎡`;}
  if(!on&&c.klass==='甲'&&c.total>=300){on=true;why+=`；但供甲類場所使用且總樓地板 ${m2(c.total)} ≥ 300㎡（第 1 項第 6 款）`;}
  return {on,why,req:['設火警自動警報設備的建築物，同時要設緊急廣播設備（第 22 條）']};});
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
  const jia=c.klass==='甲'&&c.tfa>=500;
  const on=sp||el||jia;
  return {on,why:on?[sp||el?`設有${[sp?'特別安全梯':'',el?'緊急昇降機間':''].filter(Boolean).join('、')}`:'',jia?`供甲類場所使用，樓地板面積合計 ${m2(c.tfa)} ≥ 500㎡`:''].filter(Boolean).join('；'):'未設特別安全梯或緊急昇降機間；居室另看有效通風面積',
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
  const out=R.map(r=>{
    let res; try{res=r.fn(c)||{on:false};}catch(e){res={on:false,why:'計算錯誤：'+e.message};}
    return {id:r.id,cat:r.cat,law:r.law,art:typeof r.art==='function'?r.art(c):r.art,title:r.title,...res};});
  return {c,out};
}
function sig(res){const m={};res.out.forEach(o=>{m[o.id]=(o.on===true?'1':o.on==='info'?'i':'0')+'|'+(o.lvl||'');});return m;}

/* 門檻雷達：把單一輸入往上／往下推到下一個門檻，看哪些規則改變 */
const BP={F:[2,3,5,6,7,8,10,11,15,16,25],B:[1,2,3,4],
  typ:[100,150,200,240,300,400,500,1000,1500]};
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
  return items;
}
export {solve,radar,GROUPS,CATS,R};
