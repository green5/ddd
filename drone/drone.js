const os = require('os')
const fs = require('fs')
const EventEmitter = require('events')
const child_process = require('child_process')
const shell = require('shelljs')
const ffmpeg_static = require('ffmpeg-static');

let drones_ = []
let drones = () => drones_
let currentDrone = () => drones().filter(d=>d.isconnected)[0] /// first connected

async function dping() {
  for(let d of drones()) await d.detect();
  setTimeout(async()=>await dping(),app.dping);
}

function init() {
  let ff = fs.readdirSync(__dirname).filter(a=>a.indexOf(".js")>0 && a.indexOf("-")>0).map(a=>a.replace(".js",""));
  for(let f of ff) {
    if(f.indexOf("rotg01")>=0 && app.platform!="linux") continue;
    let x = require(`./${f}.js`);
    if(!x.Drone) continue;
    let d = new (x.Drone)();
    if(d.model) {
      d.index = drones_.length
      drones_.push(d)
    }
  };
  dping();
  return drones_;
}

async function dcall(index,func) {
  try {
    let d = index==-1 ? currentDrone() : drones_[index];
    if(!d) return dlog(index,func);
    let f = func.split("(")[0];
    if(typeof(d[f])!="function") return dlog(index,func);
    let ret = await eval(`d.${func}`);
    app.klog(func,ret);
  } catch(x) { return dlog(index,func,x); }
}

function menu() {
  let public = o => Object.getOwnPropertyNames(o.__proto__).filter(a=>a.match(/^[A-Z]/))
  return drones().filter(d=>d.isconnected).map(d=>{
    return {text:d.name,children:public(d).concat("Disconnect").map(func=>{
      return {text:func,href:`_=>wssend("drone.dcall(${d.index},'${func}()')")`};
    })};
  });
}

class Drone {

  constructor(config) {
    Object.entries(config).forEach(([key,value])=>this[key]=value)
    this.isconnected = false;
    this.currentState = {};
    this.currentState.Speed = 1.0;
    this.currentState.Sensitivity = 0.2
  }

  async Disconnect() {
    return "ni";
  }

  async detect() {
    if(this.ap) {
      let cmd = app.platform=="linux" ? `ping -c 1 ${this.ap}`: `ping -n 1 ${this.ap} | %windir%/system32/find "TTL"`;
      let ok = await new Promise(done=>shell_exec(cmd,{async:true},code=>done(code==0)));
      dlog(this.name,ok,cmd);
      if(ok && this.hw) {
        let hw = app.platform=="linux" ? this.hw : this.hw.replace(/:/g,'-');
        let cmd = app.platform=="linux" ? `arp -an | grep ${hw}` : `arp -a | %windir%/system32/find "${hw}"`;
        ok = await new Promise(done=>shell_exec(cmd,{async:true},code=>done(code==0)));
        dlog(this.name,ok,cmd);
      }
      if(ok && !this.isconnected) await this.onConnect(true);
      if(!ok && this.isconnected) await this.onConnect(false);
    }
  }

  async onConnect(isconnected) {
    plog(this.name,isconnected?"connected":"disconnected");
    this.isconnected = isconnected;
    app.emit("drone-connect", isconnected, this);
    if(!isconnected) app.stopvideo();
  }

  async stop_ffmpeg(ismakemp4) {
    let ff = this.ff;
    if(ff) {
      dlog("ff",typeof_(ff));
      if(ff.stdin) ff.stdin.destroy();
      if(ff.stdout) ff.stdout.destroy();
      ff.kill();
      delete this.ff;
    }
    let fh = __dirname+"/../q.h264";
    let fn = __dirname+"/../q.mp4";
    //if(ismakemp4 && !fs.existsSync(fn)) shell_exec(`${ffmpeg_static} -c h264 -i ${fh} -q:v 1 ${fn}`,{async:true},code=>dlog(`make mp4 [${code}]`));
  }

  async start_ffmpeg() {
    await this.stop_ffmpeg(false);
    shell.rm("-f","q.h264 q.mp4 q.svg".split(" ")); // tello 960x720
    let level = "fatal"; // quiet panic fatal error warning info verbose debug trace
    let ff = child_process.spawn(ffmpeg_static,`-loglevel ${level} -fflags nobuffer -probesize 32 -c h264 -i pipe:0 -an -c:v mjpeg -q:v 1 -pix_fmt yuvj422p -f image2pipe pipe:1`.split(" "),{stdio: ['pipe','pipe','pipe']});
    process.on('exit',_=>ff.kill());
    if(ff.stderr) ff.stderr.on("data",(data)=>new Promise(done=>fs.appendFile("q.log",data,done)));
    ff.on("exit",(status,signal)=>{
      dlog(`ffmpeg.exit pid ${ff.pid} status ${status} signal ${signal}`);
      delete this.ff;
    });
    ff.stdin._writableState.highWaterMark = 4*1024*1024; // 16384
    ff.stdin.on('error',e=>plog(e))
    dlog(ff.pid);
    this.ff = ff;
    return [ff.stdin,ff.stdout]
  }

}

function onknob(pos) {
  let d = currentDrone();
  if(d) d.currentState.knob = Object.entries(pos).map(t=>`${t[0]} ${t[1]}`).join(" ");
  return d && d.onknob ? d.onknob(pos) : "knob";
}

async function onkommand(cmd) {
  if(!cmd||!cmd.length) return;
  let arg = cmd.split(" ");
  let d = currentDrone();
  if(arg[0]=='q'||arg[0]=="exit") {
    if(d && d.close) await d.close();
    return app.exit(0);
  }
  if(!d) return "no drones";
  if(d.kommand) {
    if(!d.kommand_) { /// class SpaceObject
      d.kommand_ = {};
      for(let i in d.kommand) d.kommand_[i.split(" ")[0]] = {fmt:i,proc:d.kommand[i]}
    }
    if(d.kommand_[arg[0]]) {
      let k = d.kommand_[arg[0]];
      cmd = k.proc(...scanf(cmd,k.fmt))
      arg = cmd.split(" ");
    }
  }
  switch(arg[0]) {
    case "up":      return d.onknob({y1:d.currentState.Sensitivity});
    case "down":    return d.onknob({y1:-d.currentState.Sensitivity});
    case "cw":      return d.onknob({x1:d.currentState.Sensitivity}); 
    case "ccw":     return d.onknob({x1:-d.currentState.Sensitivity});
    case "left":    return d.onknob({x2:-d.currentState.Sensitivity});
    case "right":   return d.onknob({x2:d.currentState.Sensitivity});
    case "forward": return d.onknob({y2:d.currentState.Sensitivity});
    case "back":    return d.onknob({y2:-d.currentState.Sensitivity});
    case '360': cmd = "cw 360"; break;
    case '-360': cmd = "ccw 360"; break;
    case '180': cmd = "cw 180"; break;
    case '-180': cmd = "ccw 180"; break;
    case "setsensitivity": return d.currentState.Sensitivity = parseFloat(arg[1]);
    case "nextsensitivity": return d.currentState.Sensitivity = nextsensitivity(d.currentState.Sensitivity);
    case "setspeed": d.currentState.Speed = parseFloat(arg[1]); cmd = `speed ${Math.round(100*d.currentState.Speed)||10}`; break;
    case "nextspeed": d.currentState.Speed = nextspeed(d.currentState.Speed); cmd = `speed ${Math.round(100*d.currentState.Speed)||10}`; break;
  }
  return d.onkommand ? await d.onkommand(cmd) : "onkommand";
}

function nextsensitivity(a) {
  return [0.1,0.2,0.5,1].find(x=>x>a) || 0.1;
}

function nextspeed(a) {
  return [0.2,0.5,1].find(x=>x>a) || 0.2;
}

module.exports = {Drone,init,menu,currentDrone,dcall,onkommand,onknob}
