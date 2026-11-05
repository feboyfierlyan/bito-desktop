import { useLayoutEffect, useRef, type ReactNode } from "react";

/** Keep the Rive backing store stable across onboarding, release and desktop. */
export function PetArtwork({ children }: { children: ReactNode }) {
  const frame = useRef<HTMLDivElement>(null);
  const art = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const size = () => {
      if (!frame.current || !art.current) return;
      const scale = Math.min(frame.current.clientWidth, frame.current.clientHeight) / 320;
      art.current.style.transform = `translate(-50%, -50%) scale(${scale})`;
    };
    size();
    const observer = new ResizeObserver(size);
    observer.observe(frame.current!);
    return () => observer.disconnect();
  }, []);
  return <div ref={frame} style={{position:"relative",width:"100%",height:"100%"}}>
    <div ref={art} style={{position:"absolute",width:320,height:320,left:"50%",top:"50%",transform:"translate(-50%, -50%)",willChange:"transform"}}>
      {children}
    </div>
  </div>;
}
