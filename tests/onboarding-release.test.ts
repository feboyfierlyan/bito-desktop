import {test} from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {createRequire} from 'node:module';
test('onboarding release keeps the canvas viewport fixed until the visual animation completes, then commits the 180px default once',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'bito-release-'));
 try{
  const file=join(dir,'main.cjs');
  await build({entryPoints:[resolve('electron/main.ts')],outfile:file,bundle:true,platform:'node',format:'cjs',target:'node24',define:{__BITO_PUBLIC_CONFIG__:'{"url":"","publishableKey":""}'},plugins:[{name:'release-fixture',setup(b){
   b.onResolve({filter:/^electron$/},()=>({path:'electron',namespace:'fixture'}));
   b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:`const {EventEmitter}=require('node:events');export const app=Object.assign(new EventEmitter(),{setName(){},setPath(){},requestSingleInstanceLock:()=>true,whenReady:()=>new Promise(()=>{})});export const ipcMain=new EventEmitter();export const screen={getDisplayMatching:()=>({workArea:{x:0,y:0,width:1400,height:900}})};export const BrowserWindow=class{},Menu={},MenuItem=class{},Tray=class{},nativeImage={},dialog={},Notification=class{},safeStorage={},shell={},powerMonitor={},desktopCapturer={},systemPreferences={},globalShortcut={};`}));
   b.onLoad({filter:/electron[\\/]main\.ts$/},async({path})=>({loader:'ts',contents:(await readFile(path,'utf8'))+`
    export const releaseTest={run(p,s,reduced){state=defaultState();state.settings.size=250;state.settings.reducedMotion=reduced;pet=p;studio=s;onboarding={view:{step:2,phase:'dragging',talking:false,characterReady:true}};stopGaze=()=>{};ensureChat=()=>{};persist=()=>{};publish=()=>{};showGreeting=()=>{};finishPresentation();},state:()=>state,phase:()=>onboarding?.view.phase,release:()=>onboarding?.view.release,complete:(id)=>commitPetRelease?.(id),cleanup(){clearInterval(movement);clearTimeout(releaseWatch);clearTimeout(greetingDelay)}};
   `}));
  }}]});
  const h=createRequire(import.meta.url)(file).releaseTest;
  for(const reduced of [false,true]){
   let bounds={x:700,y:300,width:282,height:282};const frames:typeof bounds[]=[];
   const pet={getBounds:()=>({...bounds}),isDestroyed:()=>false,setBounds(b:typeof bounds){bounds={...b};frames.push({...b})},setParentWindow(){},setVisibleOnAllWorkspaces(){},setFocusable(){},setAlwaysOnTop(){},setIgnoreMouseEvents(){}};
   let closed=false;const host={isDestroyed:()=>false,setOpacity(){},close(){closed=true}};
   h.run(pet,host,reduced);
   if(!reduced){
    const release=h.release();
    assert.equal(bounds.width,282,'release must preserve the full canvas buffer');
    assert.equal(release.duration,560);
    await new Promise(r=>setTimeout(r,650));
    assert.equal(bounds.width,282,'native resize must wait for renderer completion, even on a slow frame');
    assert.equal(frames.length,0,'no native resize loop during the visual morph');
    assert.equal(closed,false);
    h.complete('stale-id');
    assert.equal(frames.length,0,'stale renderer acknowledgement cannot commit a new handoff');
    h.complete(release.id);
    h.complete(release.id);
   }
   assert.equal(h.state().settings.size,180);assert.equal(bounds.width,212);assert.equal(bounds.height,212);
   assert.equal(bounds.x+bounds.width/2,841);assert.equal(bounds.y+bounds.height,582);
   assert.equal(closed,true);assert.equal(h.phase(),undefined);
   assert.equal(frames.length,1,"one atomic viewport commit, including duplicate acknowledgements");
   h.cleanup();
  }
 }finally{await rm(dir,{recursive:true,force:true})}
});
