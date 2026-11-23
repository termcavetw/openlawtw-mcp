import json,re,os,glob,sys
L=json.load(open('list.json')); st=json.load(open('stats.json'))
def rocdate(t):
    m=re.search(r'(\d{2,3})年(\d{1,2})月(\d{1,2})日',t)
    if m: return int(m.group(1)),int(m.group(2)),int(m.group(3))
    m=re.match(r'\s*(\d{3})(\d{2})(\d{2})',t)
    if m: return int(m.group(1)),int(m.group(2)),int(m.group(3))
    return None
items=[];skipped=[]
for u,t in L:
    i=u.split('=')[-1]
    if i not in st: skipped.append((i,t,'非 PDF（rar）')); continue
    n=st[i][1]
    files=[f'pages/{i}_{p:03d}.txt' for p in range(1,n+1)]
    if not all(os.path.exists(f) for f in files): skipped.append((i,t,'未完成')); continue
    native=open(f'txt/{i}.txt',encoding='utf-8',errors='ignore').read().split('\f')
    pages=[]
    for p,f in enumerate(files,1):
        tx=open(f,encoding='utf-8',errors='ignore').read()
        tx=re.sub(r'(?m)^[ \t.]+$','',tx); tx=re.sub(r'\n{3,}','\n\n',tx).strip()
        ocr=len(re.sub(r'\s','',native[p-1] if p-1<len(native) else ''))<120
        if True: tx=re.sub(r'(?<=[一-鿿，。、；：（）「」])[^\S\n]+(?=[一-鿿，。、；：（）「」])','',tx)
        pages.append({'n':p,'ocr':ocr,'text':tx})
    p1=pages[0]['text']
    meta={}
    m=re.search(r'發文日期\s*[:：]?\s*中華民國\s*(\d+)\s*年\s*(\d+)\s*月\s*(\d+)\s*日',p1)
    if m: meta['docDate']=f'民國{m.group(1)}年{m.group(2)}月{m.group(3)}日'
    m=re.search(r'發文字號\s*[:：]?\s*([^\s]{0,8}字第\s*[0-9A-Za-z\-]+\s*號)',p1)
    if m: meta['docNo']=re.sub(r'\s+','',m.group(1))
    m=re.search(r'(桃園[縣市]政府[\u4e00-\u9fff]{2,8}?[局處])',p1)
    if m: meta['issuer']=m.group(1)
    d=rocdate(t) or rocdate(p1)
    title=re.sub(r'\.(pdf|PDF)$','',t).strip()
    it={'id':i,'title':title,'url':u,'year':d[0] if d else None,'sortDate':f'{d[0]:03d}{d[1]:02d}{d[2]:02d}' if d else '','pages':pages}
    it.update(meta); items.append(it)

EXTRA=[('y1','105年度第1、2次建築法使用管理專章及其相關法令執行事務研討會會議紀錄（桃園市政府建築管理處105.7.14函送；5.11、5.28開會）','710','https://old.tyaa.org.tw/dl_file.php?id=710',105,'1050528','民國105年7月14日','桃建使字第1050033127號'),
('y2','室內裝修審查要點修正對照表、審查費收費標準、施工勘驗流程評估與內政部101.2.17函（使用管理研討會附件，掃描品質差）','710a','https://www.tyaa.org.tw/listFiles.php?Id=665f644e43731ff9db3d341da5c827e1',105,'1050528','','內授營建管字第1010801312號（附件之一）'),('x1','1060531-106年第2次建築法規執行疑義研討會議紀錄（桃園市政府建築管理處106.10.16函送）','790','https://old.tyaa.org.tw/dl_file.php?id=790',106,'1060531','民國106年10月16日','桃建照字第1060062690號'),
('x3','105年第4次建築法規執行疑義研討會議紀錄（桃園市政府建築管理處105.6.30函送）','703','https://old.tyaa.org.tw/dl_file.php?id=703',105,'1050630','民國105年6月30日','桃建照字第1050029822號'),
('x2','105年第4次建築法規執行疑義研討會議紀錄臨時提案第2案決議修正函（臨時展演場所、公共設施用地內天幕與涼亭）','703x','https://www.tyaa.org.tw/listFiles.php?Id=665f644e43731ff9db3d341da5c827e1',105,'1050801','民國105年8月1日','桃建照字第1050037445號'),
('x4','保護區原有合法建築物申請建築執照、現況合法房屋已拆除認定原則（併105年第4次會議案由1辦理）','703y','https://www.tyaa.org.tw/listFiles.php?Id=665f644e43731ff9db3d341da5c827e1',105,'1050810','民國105年8月10日','桃建照字第1050032951號')]
for x,title,i,u,yr,sd,dd,dn in EXTRA:
    fs=sorted(glob.glob(f'extra/pg/{x}_*.txt')+glob.glob(f'e2/pg/{x}_*.txt'))
    pages=[]
    for p,f in enumerate(fs,1):
        tx=open(f,encoding='utf-8',errors='ignore').read()
        tx=re.sub(r'(?m)^[ \t.]+$','',tx); tx=re.sub(r'\n{3,}','\n\n',tx).strip()
        tx=re.sub(r'(?<=[一-鿿，。、；：（）「」])[^\S\n]+(?=[一-鿿，。、；：（）「」])','',tx)
        pages.append({'n':p,'ocr':True,'text':tx})
    items.append({'id':i,'title':title,'url':u,'year':yr,'sortDate':sd,'pages':pages,'issuer':('' if i=='710a' else '桃園市政府建築管理處'),'docDate':dd,'docNo':('' if i=='710a' else dn)})
items.sort(key=lambda x:x['sortDate'],reverse=True)
D={'source':'桃園市政府建管單位法規執行疑義會議紀錄與公文（轉載於桃園市建築師公會網站）','sourceUrl':'https://www.tyaa.org.tw/listFiles.php?Id=665f644e43731ff9db3d341da5c827e1','fetchedAt':'2026-11-23','items':items}
out=sys.argv[1] if len(sys.argv)>1 else 'minutes.js'
open(out,'w',encoding='utf-8').write('// 桃園市政府建管單位法規執行疑義會議紀錄與公文（轉載於桃園市建築師公會網站 tyaa.org.tw）。\n// 非 openlawtw 資料庫內容；無文字層的頁面經 Tesseract OCR（chi_tra），字可能有誤，引用前請開原檔核對。\nexport default '+json.dumps(D,ensure_ascii=False)+';\n')
print('items',len(items),'pages',sum(len(i['pages']) for i in items),'skipped',len(skipped),'bytes',os.path.getsize(out))
for s in skipped[:5]: print(s)
print(sum(1 for i in items if i.get('docNo')),'with docNo;',sum(1 for i in items if i.get('issuer')),'with issuer')
