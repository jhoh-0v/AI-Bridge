from pathlib import Path
import subprocess, json, sys

root=Path(__file__).parent.resolve()
ffmpeg=root.parent/'tools/imageio_ffmpeg/binaries/ffmpeg-win-x86_64-v7.1.exe'
manifest=json.loads((root/'edit-manifest.json').read_text(encoding='utf-8'))
segments=root/'segments';segments.mkdir(exist_ok=True)
ass_header='''[Script Info]
ScriptType: v4.00+
PlayResX: 1920
PlayResY: 1200
[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Caption,Malgun Gothic,30,&H00F2F8F4,&H00FFFFFF,&H000B1D18,&H000B1D18,0,0,0,0,100,100,0,0,1,0,0,2,60,60,12,1
[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
'''
for index,clip in enumerate(manifest['clips']):
    if len(sys.argv)>1 and sys.argv[1]=='first' and clip.get('source')!='recording1':continue
    dest=segments/f'{index:02d}.mp4'
    if dest.exists() and dest.stat().st_size>10000:continue
    ass=segments/f'{index:02d}.ass'
    ass.write_text(ass_header+'Dialogue: 0,0:00:00.00,1:00:00.00,Caption,,0,0,0,,'+clip['caption']+'\n',encoding='utf-8-sig')
    args=[str(ffmpeg),'-hide_banner','-loglevel','error']
    if clip.get('source'):
        args+=['-ss',str(clip['start']),'-i',manifest['sources'][clip['source']],'-t',str(clip['end']-clip['start'])]
        vf=f'scale=1920:1146:flags=lanczos,pad=1920:1200:0:0:color=0x0b1d18,setsar=1,subtitles={index:02d}.ass'
    else:
        args+=['-f','lavfi','-i','color=c=0x0b1d18:s=1920x1200:r=30','-t',str(clip['duration'])]
        vf=f'subtitles={index:02d}.ass'
    args+=['-vf',vf,'-an','-r','30','-c:v','libx264','-preset','fast','-crf','20','-pix_fmt','yuv420p','-movflags','+faststart','-y',str(dest)]
    subprocess.run(args,cwd=segments,check=True)
    print(f'finished clip {index}: {clip["caption"]}',flush=True)
if len(sys.argv)>1 and sys.argv[1]=='first':sys.exit(0)
concat=segments/'concat.txt'
concat.write_text(''.join(f"file '{i:02d}.mp4'\n" for i in range(len(manifest['clips']))),encoding='utf-8')
output=root/'AI-Bridge-재무제표-시연영상.mp4'
subprocess.run([str(ffmpeg),'-hide_banner','-loglevel','error','-f','concat','-safe','0','-i',str(concat),'-c','copy','-movflags','+faststart','-y',str(output)],check=True)
print(str(output),flush=True)
