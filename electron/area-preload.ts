import { contextBridge, ipcRenderer } from "electron";
import type { AreaFrame } from "../src/area-selection";
contextBridge.exposeInMainWorld("bitoArea", {
  ready: () => ipcRenderer.send("bito:area-ready"),
  painted: (session: string) => ipcRenderer.send("bito:area-painted", session),
  cancel: (session: string) => ipcRenderer.send("bito:area-cancel", session),
  submit: (payload: unknown) => ipcRenderer.invoke("bito:area-submit", payload),
  onFrame: (fn: (v: AreaFrame) => void) => {
    const h = (_: unknown, v: AreaFrame) => fn(v);
    ipcRenderer.on("bito:area-frame", h);
    return () => ipcRenderer.removeListener("bito:area-frame", h);
  },
  onClose: (fn: () => void) => {
    const h = () => fn();
    ipcRenderer.on("bito:area-close", h);
    return () => ipcRenderer.removeListener("bito:area-close", h);
  },
});
