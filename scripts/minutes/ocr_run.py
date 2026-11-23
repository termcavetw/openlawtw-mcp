import json,subprocess,os,re,sys
w,nw=int(sys.argv[1]),int(sys.argv[2])
st=json.load(open('stats.json'))
ids=sorted(st,key=int,reverse=True)
os.makedirs('pages',exist_ok=True)
for n,i in enumerate(ids):
    if n%nw!=w: continue
    t,pages,chars=st[i]
    native=open(f'txt/{i}.txt',encoding='utf-8',errors='ignore').read().split('\f')
    for p in range(1,pages+1):
        out=f'pages/{i}_{p:03d}.txt'
        if os.path.exists(out): continue
        nt=native[p-1] if p-1<len(native) else ''
        if len(re.sub(r'\s','',nt))>=120:
            open(out,'w').write(nt); continue
        png=f'/tmp/tyaa/ocr/{i}_{p}'
        subprocess.run(['pdftoppm','-r','200','-f',str(p),'-l',str(p),'-png','-singlefile',f'pdf/{i}.pdf',png],capture_output=True)
        if not os.path.exists(png+'.png'): open(out,'w').write(''); continue
        r=subprocess.run(['tesseract',png+'.png','-','-l','chi_tra','--psm','6'],capture_output=True,timeout=300)
        open(out,'w').write(r.stdout.decode('utf-8','ignore'))
        os.remove(png+'.png')
    print('done',i,flush=True)
