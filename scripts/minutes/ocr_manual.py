import subprocess,os,sys,re
w=int(sys.argv[1])
for f,n in (('y1',93),('y2',14)):
    for p in range(1,n+1):
        if p%2!=w: continue
        out=f'pg/{f}_{p:03d}.txt'
        if os.path.exists(out): continue
        png=f'png/{f}_{p}'
        subprocess.run(['pdftoppm','-r','200','-f',str(p),'-l',str(p),'-gray','-png','-singlefile',f+'.pdf',png],capture_output=True)
        r=subprocess.run(['tesseract',png+'.png','-','-l','chi_tra','--psm','6'],capture_output=True)
        open(out,'w').write(r.stdout.decode('utf-8','ignore')); os.remove(png+'.png')
