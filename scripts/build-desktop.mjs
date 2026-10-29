import { build } from 'esbuild';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
const root=fileURLToPath(new URL('../',import.meta.url)),out=path.join(root,'desktop','dist'),ui=path.join(out,'ui');
await fs.mkdir(ui,{recursive:true});
const common={bundle:true,logLevel:'warning',legalComments:'none'};
await build({...common,entryPoints:[path.join(root,'desktop/main.mjs')],outfile:path.join(out,'main.cjs'),platform:'node',format:'cjs',target:'node24',external:['electron']});
await build({...common,entryPoints:[path.join(root,'desktop/chat-preload.js')],outfile:path.join(out,'chat-preload.cjs'),platform:'node',format:'cjs',target:'chrome144',external:['electron']});
await fs.copyFile(path.join(root,'desktop/preload.cjs'),path.join(out,'preload.cjs'));
for(const [entry,name] of [['desktop/ui/home.js','home.js'],['desktop/ui/coach.js','panel.js']])await build({...common,entryPoints:[path.join(root,entry)],outfile:path.join(ui,name),platform:'browser',format:'esm',target:'chrome144',minify:true});
for(const name of ['index.html','home.css','home-navigation.css'])await fs.copyFile(path.join(root,'desktop/ui',name),path.join(ui,name));
await fs.cp(path.join(root,'desktop/ui/assets'),path.join(ui,'assets'),{recursive:true});
await fs.copyFile(path.join(root,'desktop/ui/coach.html'),path.join(ui,'panel.html'));
await fs.copyFile(path.join(root,'desktop/ui/coach.css'),path.join(ui,'panel.css'));
if(process.argv.includes('--fixture')){
  const {xlsx}=await import('../test/coach-fixtures.mjs');
  for(const name of ['qa-chat.html','qa-chat.js','qa-chat.css'])await fs.copyFile(path.join(root,'test/desktop-ui',name),path.join(ui,name));
  for(const [phase,name,formulas] of [[0,'baseline',false],[2,'revision',true],[3,'independent',true]])await fs.writeFile(path.join(ui,`qa-${name}.xlsx`),await xlsx(phase,formulas));
}
const svg='<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" rx="58" fill="#34654e"/><path d="M56 208V128a72 72 0 0 1 144 0v80M96 208V128a32 32 0 0 1 64 0v80" fill="none" stroke="#f2f5e7" stroke-width="20" stroke-linecap="round"/></svg>';
const png=await sharp(Buffer.from(svg)).png().toBuffer();await fs.writeFile(path.join(out,'icon.png'),png);
// Windows accepts a PNG-compressed 256px icon entry.
const header=Buffer.alloc(22);header.writeUInt16LE(1,2);header.writeUInt16LE(1,4);header.writeUInt16LE(1,10);header.writeUInt16LE(32,12);header.writeUInt32LE(png.length,14);header.writeUInt32LE(22,18);
await fs.writeFile(path.join(out,'icon.ico'),Buffer.concat([header,png]));
console.log('AI Bridge desktop ready: local coach, real ChatGPT view, isolated native bridge.');
