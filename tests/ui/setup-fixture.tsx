// Synthetic setup flow: no Google login, account data, or native IPC.
import { useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { defaultState } from "../../electron/core";
import { SetupFlow } from "../../src/SetupFlow";
import { BitoTheme } from "../../src/ui/BitoTheme";
import type { Snapshot } from "../../src/shared";
import "../../src/style.css";
import "../../src/ui/astryx-bito.css";
import "../../src/ui/workspace.css";

if (import.meta.env.DEV) {
  function Fixture() {
    const [route, setRoute] = useState("auth");
    const [state, setState] = useState<Snapshot>({...defaultState(),busy:false,dragging:false,hasKey:false,chatOpen:false});
    const [report, setReport] = useState("");
    const host = useRef<HTMLDivElement>(null);
    const [sampling, setSampling] = useState(false);
    function morph() {
      const canvas = host.current!.querySelector("canvas");
      const start = performance.now();
      const frames: {width:number;mascot:number;buffer:string;sameCanvas:boolean;hidden:boolean}[] = [];
      setSampling(true); setReport("");
      function sample() {
        const panel = host.current!.querySelector<HTMLElement>(".setup-flow-panel")!;
        const mascot = host.current!.querySelector<HTMLElement>(".setup-flow-character")!;
        const current = mascot.querySelector("canvas");
        frames.push({width:panel.getBoundingClientRect().width,mascot:mascot.getBoundingClientRect().width,
          buffer:`${current?.width}x${current?.height}`,sameCanvas:current===canvas,hidden:getComputedStyle(mascot).visibility==="hidden"});
        if(performance.now()-start<1000) requestAnimationFrame(sample);
        else {
          setSampling(false);
          setReport(JSON.stringify({frames:frames.length,first:frames[0],last:frames.at(-1),
            distinctPanelWidths:new Set(frames.map(f=>f.width.toFixed(1))).size,
            distinctMascotWidths:new Set(frames.map(f=>f.mascot.toFixed(1))).size,
            sameCanvas:frames.every(f=>f.sameCanvas),neverHidden:frames.every(f=>!f.hidden),
            canvasBuffers:[...new Set(frames.map(f=>f.buffer))]},null,2));
        }
      }
      requestAnimationFrame(sample);
      setRoute(route==="auth"?"onboarding":"auth");
    }
    return <BitoTheme><div ref={host}>
      <SetupFlow state={state} route={route} act={async()=>({ok:true})}/>
      <aside style={{position:"fixed",right:12,top:40,zIndex:10,background:"white",padding:8,borderRadius:8,fontSize:11}}>
        <button disabled={sampling} onClick={morph}>Morph login ↔ onboarding</button>
        <button onClick={()=>setState(s=>({...s,loginPreview:s.loginPreview==="denied"?"idle":"denied"}))}>Toggle login feedback</button>
        <pre aria-label="Setup measurements">{report}</pre>
      </aside>
    </div></BitoTheme>;
  }
  createRoot(document.getElementById("root")!).render(<Fixture/>);
}
