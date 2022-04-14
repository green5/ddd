require('./hh.js')
const os = require('os')
const fs = require('fs')
const util = require("util")
const express = require('express')
const http = require('http')
const WebSocket = require('ws'); // https://www.npmjs.com/package/ws
const child_process = require('child_process') 
const P2J = require('pipe2jpeg');
const readline = require('readline'); // https://nodejs.org/api/readline.html#readline https://github.com/maleck13/readline
//const cpp = require('./build/Release/cppaddon.node');
const shell = require('shelljs')
const open = require('open')
const drone = require('./drone/drone.js');
const udp = require('./drone/udp.js')
const ffmpeg_static = require('ffmpeg-static');

global.app = express();
app.platform = os.platform();
app.client_active_ = [];
process.on("exit",code=>dlog(code));
process.on('SIGTERM',code=>dlog(code));
app.exit = async(a) => {
  await wssend("closewindow");
  process.stdin.setRawMode(false);
  process.exit(0);
}

global.wssend = async(func,...args) => {
  //if(func!="showstate") plog(func,...args);
  for(let a of Object.entries(app.client_active_)) {
    let remote = a[0];
    let client = a[1];
    await client.send(func,...args)
  }
}

async function onkey(key) {
  //plog(key);
  switch(key) {
    case "Q": case "q": key ="exit"; break;
    case "w": key = "up"; break;
    case "s": key = "down"; break;
    case "a": key = "ccw 5"; break;
    case "d": key = "cw 5"; break;

    case "up": key = "forward"; break;
    case "down": key = "back"; break;

    case '1': key = "setsensitivity 0.1"; break; 
    case '2': key = "setsensitivity 0.2"; break; 
    case '3': key = "setsensitivity 0.3"; break; 
    case '4': key = "setsensitivity 0.4"; break; 
    case '5': key = "setsensitivity 0.5"; break; 
    case '6': key = "setsensitivity 0.6"; break; 
    case '7': key = "setsensitivity 0.7"; break; 
    case '8': key = "setsensitivity 0.8"; break; 
    case '9': key = "setsensitivity 0.9"; break; 
    case '0': key = "setsensitivity 1.0"; break; 

    case "t": key = "start 1"; break;
    case "l": key = "start 0"; break;
    case "M": key = "motor 0"; break; 
    case "m": key = "motor 1"; break;
    case "X": key = "video 0"; break;
    case "x": key = "video 1"; break;
    case "v": key = "camera 1"; break;
    case "V": key = "camera 0"; break;
  }
  return await drone.onkommand(key);
}

app.klog = (req,res) => {
  plog.one(req,"=>",typeof_(res),typeof(res)=="string"?res:util.inspect(res,{depth:null,compact:true}));
}

function menu() {
  let ret = [];
  ret.push({"text":"Drones"});
  let d = drone.menu()
  if(d.length>0) ret[0].children = d;
  ret.push({
    "text": "Sites",
    "children": [
      {"href": "()=>refresh(window.location.href)","text": "Refresh"},
      {"href": "https://telegram.me/dji_tello", "text": "Telegram"},
      {"href": "https://github.com/","text": "GitHub"},
      {"href": "q.html","text": "Last Video"},
    ]
  });
  ret.push({
    "text": "Options",
    "children": [
      {text:"High FPS",href:`_=>wssend("drone.dcall(-1,'setfps(2)')")`}, /// tello 
      {text:"Middle FPS",href:`_=>wssend("drone.dcall(-1,'setfps(1)')")`},
      {text:"Low FPS",href:`_=>wssend("drone.dcall(-1,'setfps(0)')")`},
    ]
  });
  return ret;
}

class Client {
  constructor(remote,ws) {
    dlog(`ws.connect ${remote}`);
    this.remote = remote;
    this.ws = ws;
    this.send("startmenu",menu());
    this.send("stopvideo");
    app.on("drone-connect",(c,d)=>this.send("startmenu",menu()));
  }
  async onmsg(msg) {
    //dlog(msg);
    try {
      if(typeof(msg)=="string") {
        if(msg.indexOf("drone.dcall(")==0) eval(msg);
        else throw "bad string msg";
      } else if(typeof(msg)=="object") {
        if(msg.pos) drone.onknob(msg.pos);
        if(msg.key) app.klog(msg.key,await onkey(msg.key));
      } else {
        throw "bad typeof msg";
      }
    } catch(x) { plog(x,msg); }
  }
  send(func,...args) {
    if(this.ws) this.ws.send(JSON.stringify({func,args:args})); else plog();
  }
}

let makevideo, onp2j;

app.stopvideo = _ => {
  makevideo = (req,res) => {
    res.writeHead(400)
    res.end()
  };
  wssend("stopvideo");
}
app.startvideo = istream => {
  dlog(typeof_(istream));
  const p2j = new P2J();
  makevideo = (req,res) => {
    res.writeHead(200, {
      'Expires': 'Mon, 27 Sep 1980 00:00:00 GMT',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Content-Type': 'multipart/x-mixed-replace;boundary=ffmpeg_streamer'
    });
    if(istream) istream.pipe(p2j);
    let t1 = new Date().getTime()/1000;
    let nn = 0;
    onp2j = p2j.on('jpeg', (chunk) => {
      //plog(chunk.length);
      res.write(`--ffmpeg_streamer\r\nContent-Type: image/jpeg\r\nContent-Length: ${chunk.length}\r\n\r\n`)
      res.write(chunk)
      let tt = new Date().getTime()/1000 - t1;
      ++nn;
      if(tt>=3) {
        app.oFPS = (nn/tt).toFixed(0);
        t1 = new Date().getTime()/1000;
        nn = 0;
      }
    })
    dlog(typeof_(p2j));
  };
  wssend("startvideo","/video");
  return p2j;
}

app.get("/video",(req,res)=>makevideo(req,res))
app.get("/q.h264",(req,res)=>res.sendFile(__dirname+"/q.h264"))
app.get("/q.mp4",(req,res)=>{
  let fh = "q.h264"; let fn = "q.mp4";
  if(!fs.existsSync(fn)) shell_exec(`${ffmpeg_static} -c h264 -i ${fh} -q:v 1 ${fn}`);
  res.sendFile(__dirname+'/'+fn)
})

function startKonsole() {
  let mode;
  readline.emitKeypressEvents(process.stdin);
  var rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: '> ',
    terminal: false,
  });
  rl.on('line',async function(line){
    if(mode) return;
    while(line.charCodeAt(0)<=0x20) line = line.substr(1);
    if(line=="raw")
      process.stdin.setRawMode(mode=true);
    else {
      if(line.length) {
        app.klog(line,await drone.onkommand(line));
      }
      let d = drone.currentDrone(); rl.setPrompt(d?`[${d.name}] `:'> ');
      rl.prompt();
    }
  });
  process.stdin.on('keypress', async(str,evt) => {
    if(!mode) return;
    let key = evt.sequence.charCodeAt(0)<=32 ? evt.name : evt.sequence; //let mod = [evt.shift?"s":"",evt.ctrl?"c":"",evt.meta?"m":""].join("");
    if(key=='escape') {
      process.stdin.setRawMode(mode=false);
      let d = drone.currentDrone(); rl.setPrompt(d?`[${d.name}] `:'> ');
      rl.prompt();
    }
    else {
      app.klog(key,await onkey(key));
    }
  })
  process.stdin.setRawMode(mode=true);
  if(!mode) rl.prompt();
}

function wss_connection(ws,request) {
  let remote = ws._sender._socket.remoteAddress; /// proxy,...
  let client = new Client(remote,ws);
  app.client_active_[remote] = client;
  ws.on('close',code=>{
    if(code!=1001) plog("close",client.remote,code)
    delete app.client_active_[remote];
  });
  ws.on('message', msg=>{
    let a = JSON.parse(msg);
    if(a) client.onmsg(a); else plog("jsonParseError",msg,a);
  });
}

async function startApp(port) {
  app.dping = 5000;
  app.base = `http://${app.platform=="linux"?process.env.HOSTNAME:process.env.COMPUTERNAME}:${port}`;
  app.setMaxListeners(100);
  app.use(express.static('public'));
  app.httpServer = http.createServer(app)
  //app.httpServer.on('request',(req,res)=>dlog(req.url));
  app.wss = new WebSocket.Server({server:app.httpServer});
  app.wss.on('connection', wss_connection);
  app.stopvideo();
  try {
    app.httpServer.listen(port,"0.0.0.0");
  } catch(e) { perr(e); }
  drone.init();
  plog(app.platform,app.base,app.dping);
  startKonsole();
  if(app.platform=="win32") open(app.base);
}

if(process.argv.length==2) {
  let arg = "--no-deprecation --unhandled-rejections=strict --trace-uncaught --trace-warnings app.js startApp(3549)";
  shell.rm("-f","q.log");
  if(app.platform=="win32") shell_exec("chcp 855");
  while(1==1) {
    let t = child_process.spawnSync("node",arg.split(" "),{stdio:'inherit'});
    dlog("spawn",t);
    if(t.status==0) break;
  }
} 
else {
  let a = process.argv[2] || "";  
  if(a.indexOf("-h")>=0) return plog("usage: node app.js");
  eval(a);
}



