'use client';
import { useEffect, useRef } from 'react';

export default function Modal({children,className,label,labelledBy,onClose}) {
  const panel=useRef(null),close=useRef(onClose);close.current=onClose;
  useEffect(()=>{
    const previous=document.activeElement,overflow=document.body.style.overflow;
    document.body.style.overflow='hidden';
    const focusable=()=>[...panel.current.querySelectorAll('button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex="0"]')].filter(el=>el.getClientRects().length);
    (focusable()[0]||panel.current).focus();
    function keydown(event){
      if(event.key==='Escape'){event.preventDefault();close.current();return;}
      if(event.key!=='Tab')return;
      const nodes=focusable(),first=nodes[0],last=nodes.at(-1);
      if(!first){event.preventDefault();panel.current.focus();}
      else if(event.shiftKey&&(document.activeElement===first||!panel.current.contains(document.activeElement))){event.preventDefault();last.focus();}
      else if(!event.shiftKey&&(document.activeElement===last||!panel.current.contains(document.activeElement))){event.preventDefault();first.focus();}
    }
    document.addEventListener('keydown',keydown);
    return()=>{document.removeEventListener('keydown',keydown);document.body.style.overflow=overflow;if(previous?.isConnected)previous.focus();};
  },[]);
  return <div className="modal-backdrop" onClick={onClose}><section ref={panel} className={className} role="dialog" aria-modal="true" aria-label={label} aria-labelledby={labelledBy} tabIndex={-1} onClick={e=>e.stopPropagation()}>{children}</section></div>;
}
