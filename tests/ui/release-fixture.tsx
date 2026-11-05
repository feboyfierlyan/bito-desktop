// Local-only visual verification of the production Rive canvas and release motion.
import React, { useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { defaultState } from "../../electron/core";
import { PetArtwork } from "../../src/PetArtwork";
import { Character } from "../../src/Character";
import { animatePetRelease } from "../../src/pet-release";
import type { Snapshot } from "../../src/shared";
import "../../src/style.css";
if (import.meta.env.DEV) {
  const state = {...defaultState(),busy:false,dragging:false,chatOpen:false,hasKey:false,
    presentation:{step:2,phase:"ready",talking:false,characterReady:true}} as Snapshot;
  function Fixture() {
    const stage = useRef<HTMLDivElement>(null);
    const [ready, setReady] = useState(false);
    const [report, setReport] = useState("Ready to measure");
    const [running, setRunning] = useState(false);
    const cleanup = useRef<(() => void) | undefined>(undefined);
    function run() {
      cleanup.current?.(); setRunning(true);
      const node = stage.current!;
      const frames: {time:number;width:number;buffer:string}[]=[];
      const start = performance.now();
      let sampling = true;
      function sample(){
        const canvas = node.querySelector("canvas")!;
        frames.push({time:Math.round(performance.now()-start),width:node.getBoundingClientRect().width,
          buffer:`${canvas.width}x${canvas.height}`});
        if(sampling)requestAnimationFrame(sample);
      }
      requestAnimationFrame(sample);
      cleanup.current = animatePetRelease(node,{id:"visual",width:282,height:282,duration:560,
        target:{x:35,y:70,width:212,height:212}},()=>{
        sampling=false; setRunning(false);
        setReport(JSON.stringify({frames:frames.length,distinctWidths:new Set(frames.map(f=>f.width.toFixed(2))).size,
          canvasBuffers:[...new Set(frames.map(f=>f.buffer))],start:frames[0],end:frames.at(-1),
          samples:frames.filter((_,i)=>i%5===0)},null,2));
      });
    }
    return <main style={{padding:32,background:"#f4f6f4",minHeight:"100vh"}}>
      <h1>Onboarding → desktop · 180 px</h1>
      <button disabled={!ready || running} onClick={run}>Release Bito</button>
      <div style={{position:"relative",width:340,height:330,marginTop:30}}>
        <div ref={stage} style={{width:282,height:282}}><PetArtwork><Character state={state} stableResolution onReady={()=>setReady(true)}/></PetArtwork></div>
      </div>
      <pre aria-label="Animation measurements">{report}</pre>
    </main>;
  }
  createRoot(document.getElementById("root")!).render(<Fixture/>);
}
