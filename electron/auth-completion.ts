import { createServer, type Server } from "node:http";
import { randomBytes, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

export type CompletionAssets = { artwork?: string; character?: string };
export type CompletionStatus = "success" | "error";

export async function readCompletionAssets(
  root: string,
): Promise<CompletionAssets> {
  const [artwork, icon] = await Promise.all([
    readFile(join(root, "artwork/bito-login-background.svg"), "utf8"),
    readFile(join(root, "icon.svg"), "utf8"),
  ]);
  // Use the existing Bito vector, without its app-icon tile or backing plate.
  const character = icon
    .replace(/<rect\b[^>]*fill="#(?:f5f9ff|e2eeff)"[^>]*\/>/g, "")
    .replace('viewBox="0 0 1024 1024"', 'viewBox="165 100 694 790"');
  return { artwork, character };
}

const svgData = (svg: string) =>
  `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;

export function renderCompletionPage(
  status: CompletionStatus,
  assets: CompletionAssets = {},
  action = "",
  scriptNonce = "",
) {
  const success = status === "success";
  const title = success ? "Sudah masuk." : "Belum bisa masuk.";
  const description = success
    ? "Kita lanjut di Bito, yuk."
    : "Kembali ke Bito untuk mencoba lagi.";
  const artwork = assets.artwork
    ? `<img class="artwork" src="${svgData(assets.artwork)}" alt="" aria-hidden="true" draggable="false">`
    : "";
  const mascot = assets.character
    ? `<img class="mascot" src="${svgData(assets.character)}" width="120" height="136" alt="Bito" draggable="false">`
    : `<span class="brand-name">Bito</span>`;
  // Paths and nonce are generated locally, never from an OAuth response/user field.
  if (action && !/^\/complete\/[a-f0-9-]{36}\/return$/.test(action))
    throw Error("Invalid completion action");
  if (scriptNonce && !/^[a-zA-Z0-9+/=]+$/.test(scriptNonce))
    throw Error("Invalid completion nonce");
  return `<!doctype html>
<html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><meta name="referrer" content="no-referrer"><title>${success ? "Sudah masuk" : "Coba lagi"} — Bito</title>
<style>
:root{color-scheme:light;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#1d1d1f;background:#f5f9ff;font-synthesis:none}
*{box-sizing:border-box}body{margin:0;min-width:280px;min-height:100svh;display:grid;place-items:center;padding:36px 22px;isolation:isolate;overflow-x:hidden}
.artwork{position:fixed;inset:0;z-index:-1;width:100%;height:100%;object-fit:cover;pointer-events:none;user-select:none}
.card{width:min(388px,100%);padding:34px 30px 30px;border:1.5px solid #255b3f;border-radius:23px;background:#fff;box-shadow:0 14px 48px #163e2826;text-align:center;animation:card-in .56s cubic-bezier(.22,1,.36,1) both}
.mascot-stage{position:relative;width:120px;height:136px;margin:0 auto 20px;animation:mascot-in .7s cubic-bezier(.22,1,.36,1) both;user-select:none}
.mascot{display:block;width:120px;height:136px;object-fit:contain}.brand-name{display:grid;height:100%;place-items:center;font-size:36px;font-weight:750;color:#246b41}
.badge{position:absolute;right:-5px;bottom:5px;display:grid;place-items:center;width:30px;height:30px;border:4px solid #fff;border-radius:50%;background:${success ? "#e5f4e9" : "#fff0e6"};color:${success ? "#246b41" : "#a35228"};animation:badge-in .4s .24s cubic-bezier(.22,1,.36,1) both}
.badge svg{width:16px;height:16px}.check{stroke-dasharray:24;stroke-dashoffset:24;animation:draw-check .4s .42s ease forwards}
h1{margin:0;font-size:30px;font-weight:720;line-height:1.2;letter-spacing:-1.05px}p{margin:10px 0 0;color:#73757d;font-size:14px;line-height:1.6;letter-spacing:-.1px}
.copy{animation:copy-in .42s .1s cubic-bezier(.22,1,.36,1) both}form{margin:26px 0 0;animation:copy-in .42s .16s cubic-bezier(.22,1,.36,1) both}
button{appearance:none;display:flex;align-items:center;justify-content:center;gap:9px;width:100%;min-height:46px;padding:12px 18px;border:0;border-radius:13px;background:#007aff;color:white;font:600 14px/20px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;cursor:pointer;transition:background .16s ease,transform .18s cubic-bezier(.22,1,.36,1),box-shadow .18s ease;-webkit-tap-highlight-color:transparent}
button svg{width:17px;height:17px;transition:transform .2s cubic-bezier(.22,1,.36,1)}button:hover{background:#006fe9;box-shadow:0 4px 14px #007aff25}button:hover svg{transform:translateX(2px)}button:active{transform:scale(.977);box-shadow:none}button:focus-visible{outline:3px solid #007aff55;outline-offset:4px}button:disabled{cursor:wait;opacity:.78}button[data-opened]{background:#006fe9}
.fallback{font-size:12px;margin-top:13px}.fallback[hidden]{display:none}.sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
@keyframes card-in{from{opacity:0;transform:translateY(14px) scale(.975)}to{opacity:1;transform:none}}@keyframes mascot-in{from{opacity:0;transform:translateY(8px) scale(.94)}to{opacity:1;transform:none}}@keyframes copy-in{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}@keyframes badge-in{from{opacity:0;transform:scale(.65)}to{opacity:1;transform:scale(1)}}@keyframes draw-check{to{stroke-dashoffset:0}}
@media(max-width:420px){body{padding:24px 18px}.card{padding:30px 24px 26px}h1{font-size:28px}}
@media(prefers-reduced-motion:reduce){*,*::before,*::after{animation:none!important;transition:none!important}.check{stroke-dashoffset:0}}
</style></head><body>${artwork}<main class="card" aria-labelledby="completion-title"><div class="mascot-stage">${mascot}<span class="badge" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">${success ? '<path class="check" d="m5 12 4 4L19 6"/>' : '<path d="M12 6v7m0 4h.01"/>'}</svg></span></div><div class="copy"><h1 id="completion-title">${title}</h1><p>${description}</p></div>${action ? `<form method="post" action="${action}"><button type="submit"><span>Kembali ke Bito</span><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14m-6-6 6 6-6 6"/></svg></button></form><p class="fallback" hidden>Buka Bito dari Dock atau taskbar untuk melanjutkan.</p><span class="sr-only" role="status" aria-live="polite"></span>` : ""}</main>${
    action
      ? `<script nonce="${scriptNonce}">
const form=document.querySelector('form'),button=form.querySelector('button'),status=document.querySelector('[role=status]');
form.addEventListener('submit',async event=>{event.preventDefault();if(button.disabled)return;button.disabled=true;button.setAttribute('aria-busy','true');try{const result=await fetch(form.action,{method:'POST',credentials:'omit',redirect:'error',cache:'no-store'});if(!result.ok)throw Error();button.dataset.opened='true';status.textContent='Jendela Bito dibuka.';}catch{document.querySelector('.fallback').hidden=false;status.textContent='Buka Bito dari Dock atau taskbar untuk melanjutkan.';}finally{button.disabled=false;button.removeAttribute('aria-busy');}});
</script>`
      : ""
  }</body></html>`;
}

/** A temporary presentation endpoint, separate from the consumed OAuth callback. */
export class AuthCompletionHost {
  private server?: Server;
  private timer?: ReturnType<typeof setTimeout>;
  constructor(private assets: CompletionAssets = {}) {}

  async open(status: CompletionStatus, onReturn: () => void | Promise<void>) {
    this.close();
    const path = `/complete/${randomUUID()}`;
    const nonce = randomBytes(18).toString("base64");
    const html = renderCompletionPage(
      status,
      this.assets,
      `${path}/return`,
      nonce,
    );
    let origin = "";
    const server = createServer((request, response) => {
      let url: URL;
      try {
        url = new URL(request.url || "/", origin);
      } catch {
        response.writeHead(400).end();
        return;
      }
      const headers = {
        "Cache-Control": "no-store",
        "Referrer-Policy": "no-referrer",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": `default-src 'none'; img-src data:; style-src 'unsafe-inline'; script-src 'nonce-${nonce}'; connect-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'`,
      };
      if (request.headers.host !== new URL(origin).host || url.search) {
        response.writeHead(404, headers).end();
        return;
      }
      if (request.method === "GET" && url.pathname === path) {
        response
          .writeHead(200, {
            ...headers,
            "Content-Type": "text/html; charset=utf-8",
          })
          .end(html);
        return;
      }
      if (request.method === "POST" && url.pathname === `${path}/return`) {
        if (request.headers.origin !== origin) {
          response.writeHead(403, headers).end();
          return;
        }
        request.resume();
        void Promise.resolve()
          .then(onReturn)
          .then(
            () => response.writeHead(204, headers).end(),
            () => response.writeHead(503, headers).end(),
          );
        return;
      }
      response.writeHead(404, headers).end();
    });
    this.server = server;
    try {
      await new Promise<void>((resolve, reject) => {
        server.once("error", reject);
        server.listen(0, "127.0.0.1", resolve);
      });
      const address = server.address();
      if (!address || typeof address === "string")
        throw Error("Completion host unavailable");
      origin = `http://127.0.0.1:${address.port}`;
      this.timer = setTimeout(() => this.close(), 5 * 60000);
      this.timer.unref();
      server.unref();
      return `${origin}${path}`;
    } catch (error) {
      this.close();
      throw error;
    }
  }

  close() {
    clearTimeout(this.timer);
    this.server?.close();
    this.server?.closeAllConnections();
    this.server = undefined;
  }
}
