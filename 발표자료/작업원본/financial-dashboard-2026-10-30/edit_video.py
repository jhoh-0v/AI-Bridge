from pathlib import Path
import subprocess, json, sys
from concurrent.futures import ThreadPoolExecutor

root=Path(__file__).parent.resolve()
ffmpeg=root.parent/'tools/imageio_ffmpeg/binaries/ffmpeg-win-x86_64-v7.1.exe'
manifest=json.loads((root/'edit-manifest.json').read_text(encoding='utf-8-sig'))
segments=root/'segments'; segments.mkdir(exist_ok=True)
header='''[Script Info]
ScriptType: v4.00+
PlayResX: 1920
PlayResY: 1200
[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Caption,Malgun Gothic,30,&H00F2F8F4,&H00FFFFFF,&H000B1D18,&H000B1D18,0,0,0,0,100,100,0,0,1,0,0,2,55,55,12,1
Style: Title,Malgun Gothic,56,&H00F2F8F4,&H00FFFFFF,&H000B1D18,&H000B1D18,-1,0,0,0,100,100,0,0,1,0,0,5,100,100,50,1
[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
'''
def render_clip(item):
    index,clip=item
    dest=segments/f'{index:02d}.mp4'
    ass=segments/f'{index:02d}.ass'
    style='Caption' if clip.get('source') else 'Title'
    ass.write_text(header+f'Dialogue: 0,0:00:00.00,1:00:00.00,{style},,0,0,0,,'+clip['caption']+'\n',encoding='utf-8-sig')
    args=[str(ffmpeg),'-hide_banner','-loglevel','error']
    if clip.get('source'):
        args+=['-ss',str(clip['start']),'-t',str(clip['end']-clip['start']),'-i',manifest['sources'][clip['source']]]
        speed=clip.get('speed',1)
        vf=f'setpts=(PTS-STARTPTS)/{speed},fps=30,scale=1920:1146:force_original_aspect_ratio=decrease:flags=lanczos,pad=1920:1200:(ow-iw)/2:0:color=0x0b1d18,setsar=1,subtitles={index:02d}.ass'
    else:
        args+=['-f','lavfi','-i','color=c=0x0b1d18:s=1920x1200:r=30','-t',str(clip['duration'])]
        vf=f'subtitles={index:02d}.ass'
    args+=['-vf',vf,'-an','-r','30','-c:v','libx264','-threads','4','-preset','fast','-crf','20','-pix_fmt','yuv420p','-movflags','+faststart','-y',str(dest)]
    subprocess.run(args,cwd=segments,check=True)
    print(f'finished clip {index}: {clip["caption"]}',flush=True)
selected=set(map(int,sys.argv[1:])) if len(sys.argv)>1 else set(range(len(manifest['clips'])))
with ThreadPoolExecutor(max_workers=2) as pool:
    list(pool.map(render_clip,((i,c) for i,c in enumerate(manifest['clips']) if i in selected)))
concat=segments/'concat.txt'
concat.write_text(''.join(f"file '{i:02d}.mp4'\n" for i in range(len(manifest['clips']))),encoding='utf-8')
output=root/'AI-Bridge-연도선택-대시보드-시연.mp4'
subprocess.run([str(ffmpeg),'-hide_banner','-loglevel','error','-f','concat','-safe','0','-i',str(concat),'-c','copy','-movflags','+faststart','-y',str(output)],check=True)
print(str(output),flush=True)
