import { contextBridge, ipcRenderer } from "electron";
// No app state, secrets, capture API or command bridge in this click-through UI.
contextBridge.exposeInMainWorld("bitoSpotlight", {
  listen(fn: (value: unknown) => void) {
    const listener = (_event: unknown, value: unknown) => fn(value);
    ipcRenderer.on("bito:spotlight", listener);
    ipcRenderer.send("bito:spotlight-ready");
    return () => ipcRenderer.removeListener("bito:spotlight", listener);
  },
  painted() {
    ipcRenderer.send("bito:spotlight-painted");
  },
});
