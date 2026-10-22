import { contextBridge, ipcRenderer } from "electron";
import type { BitoAPI } from "../src/shared";
const api: BitoAPI = {
  getState: () => ipcRenderer.invoke("bito:state"),
  command: (name, payload) => ipcRenderer.invoke("bito:command", name, payload),
  onState: (fn) => {
    const handler = (_: unknown, state: any) => fn(state);
    ipcRenderer.on("bito:state", handler);
    return () => ipcRenderer.removeListener("bito:state", handler);
  },
  onDelta: (fn) => {
    const handler = (_: unknown, event: any) => fn(event);
    ipcRenderer.on("bito:delta", handler);
    return () => ipcRenderer.removeListener("bito:delta", handler);
  },
  dragStart: () => ipcRenderer.send("bito:drag-start"),
  dragMove: (dx, dy) => ipcRenderer.send("bito:drag-move", dx, dy),
  dragEnd: () => ipcRenderer.send("bito:drag-end"),
  setHit: (hit) => ipcRenderer.send("bito:hit", hit),
  contextMenu: () => ipcRenderer.send("bito:menu"),
  toggleChat: () => ipcRenderer.send("bito:toggle"),
};
contextBridge.exposeInMainWorld("bito", api);
