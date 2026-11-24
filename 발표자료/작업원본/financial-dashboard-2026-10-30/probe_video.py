from pathlib import Path
import subprocess,sys,math
from PIL import Image,ImageDraw
root=Path(__file__).parent
ffmpeg=root.parent/'tools/imageio_ffmpeg/binaries/ffmpeg-win-x86_64-v7.1.exe'
source=sys.argv[1]; times=[float(t) for t in sys.argv[2].split(',')];tag=sys.argv[3]
thumbs=[]
for i,t in enumerate(times):
    dest=root/f'{tag}-{i:02d}.png'
    subprocess.run([str(ffmpeg),'-hide_banner','-loglevel','error','-ss',str(t),'-i',source,'-frames:v','1','-vf','scale=600:-1','-update','1','-y',str(dest)],check=True)
    frame=Image.open(dest).convert('RGB')
    thumb=Image.new('RGB',(600,frame.height+24),'#1b2722');thumb.paste(frame,(0,24))
    ImageDraw.Draw(thumb).text((8,4),f'{tag}  {t:.1f}s',fill='white');thumbs.append(thumb)
height=max(t.height for t in thumbs)
sheet=Image.new('RGB',(1800,height*math.ceil(len(thumbs)/3)),'#1b2722')
for i,im in enumerate(thumbs):sheet.paste(im,((i%3)*600,(i//3)*height))
sheet.save(root/f'{tag}-contact.png')
