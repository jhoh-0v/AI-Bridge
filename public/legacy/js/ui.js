const paths = {
  bridge:'<path d="M4 20V11a8 8 0 0 1 16 0v9M8 20v-9a4 4 0 0 1 8 0v9"/><path d="M2 20h20"/>',
  grid:'<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  book:'<path d="M4 4h6a3 3 0 0 1 3 3v14a3 3 0 0 0-3-3H4zM13 7a3 3 0 0 1 3-3h5v14h-5a3 3 0 0 0-3 3"/>',
  compass:'<circle cx="12" cy="12" r="9"/><path d="m16 8-2 6-6 2 2-6z"/>',
  chart:'<path d="M4 3v17h17M8 15v-4M13 15V6M18 15V9"/>',
  file:'<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9zM14 3v6h6M8 13h8M8 17h5"/>',
  mail:'<rect x="3" y="5" width="18" height="14" rx="3"/><path d="m4 7 8 6 8-6"/>',
  arrow:'<path d="M4 12h16m-6-6 6 6-6 6"/>',
  back:'<path d="M20 12H4m6-6-6 6 6 6"/>',
  check:'<path d="m5 12 4 4L19 6"/>',
  circle:'<circle cx="12" cy="12" r="8"/>',
  spark:'<path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5z"/>',
  lock:'<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3"/>',
  external:'<path d="M14 3h7v7M21 3l-10 10M10 4H5a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h13a2 2 0 0 0 2-2v-5"/>',
  copy:'<rect x="8" y="8" width="12" height="13" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/>',
  download:'<path d="M12 3v12m-5-5 5 5 5-5M4 16v4h16v-4"/>',
  info:'<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7v.2"/>',
  leaf:'<path d="M20 3c-1 9-2 15-9 16-5 0-8-3-7-7C5 5 13 7 20 3zM4 21l10-10"/>'
};
const icon = (name, extra='') => '<svg class="icon '+extra+'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+(paths[name]||paths.spark)+'</svg>';
const h = value => String(value??'').replace(/[&<>"']/g, ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));

function bridgeArt(){
 return '<div class="hero-visual" aria-hidden="true"><svg viewBox="0 0 400 245" fill="none"><path d="M21 195h358" stroke="#dde3d2"/><path d="M57 194v-30c0-78 62-132 143-132s143 54 143 132v30" fill="#e8eddf"/><path d="M92 194v-30c0-59 46-99 108-99s108 40 108 99v30" fill="#f7f7f2"/><path d="M60 194v-30c0-77 61-129 140-129s140 52 140 129v30" stroke="#bbc9aa" stroke-width="2" stroke-dasharray="5 7"/><circle cx="200" cy="35" r="20" fill="#e96b4d"/><path d="m193 35 5 5 9-10" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/><rect x="20" y="151" width="82" height="37" rx="9" fill="white" stroke="#dfe5d6"/><text x="61" y="175" text-anchor="middle" fill="#7e8c6d" font-size="12" font-family="sans-serif">요청하기</text><rect x="159" y="102" width="82" height="37" rx="9" fill="white" stroke="#dfe5d6"/><text x="200" y="126" text-anchor="middle" fill="#7e8c6d" font-size="12" font-family="sans-serif">확인하기</text><rect x="299" y="151" width="82" height="37" rx="9" fill="#ed6b4d"/><text x="340" y="175" text-anchor="middle" fill="white" font-size="12" font-family="sans-serif">혼자 하기</text><path d="M116 172h17m-4-4 4 4-4 4M267 172h17m-4-4 4 4-4 4" stroke="#abb99c" stroke-width="1.4" stroke-linecap="round"/><path d="M24 92h12m-6-6v12M361 72h12m-6-6v12" stroke="#c2cdb5" stroke-width="1.5"/><circle cx="321" cy="45" r="3" fill="#e6c5af"/><circle cx="98" cy="59" r="3" fill="#c9d4ba"/></svg><span class="visual-caption">작은 실습 하나가, 스스로 하는 힘으로.</span></div>';
}

export { icon, h, bridgeArt };
