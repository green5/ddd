/*
https://blog.horner.tj/hacking-chinese-drones-for-fun-and-no-profit/
*/
const fs = require('fs')
const EventEmitter = require('events')
let emitter = new EventEmitter()
const dgram = require('dgram')
const net = require('net')
//const {PromiseSocket} = require("promise-socket") // https://www.npmjs.com/package/promise-socket
const { Readable, Writable, Duplex, Transform } = require('stream')
const CircularBuffer = require("circular-buffer")
const NetKeepAlive = null; //require('net-keepalive') // "net-keepalive": "^3.0.0",

let config = {}

const COMMAND_CALIBRATE_GYRO = 128
const COMMAND_START_MOTOR = 64
const COMMAND_STOP_MOTOR = 0

function initModule(a) {
  config = a;
  return module.exports;
}

function arrayEqual(a1, a2) {
  let i = a1.length;
  if (i != a2.length) return false;
  while (i--) {
   if (a1[i] !== a2[i]) return false;
  }
  return true;
}

class Queue {
  constructor(z) {
    this.z = z;
    this.arr = [];
  }
  frontpush(cmd,state,count) {
    this.arr.unshift({state:state,count:count && count>1 ? count : 1,cmd:cmd})
  }
  backpush(cmd,state,count) {
    this.arr.push({state:state,count:count && count>1 ? count : 1,cmd:cmd})
  }
  get() {
    if (this.arr.length == 0) 
      return [[...this.z],"z"];
    else {
      let state = this.arr[0].state;
      let cmd = this.arr[0].cmd;
      if(--this.arr[0].count<=0) this.arr.shift()
      return [[...state],cmd];
    }
  }
  clear() {
    this.arr = []
  }
  len() {
    return this.arr.length;
  }
  set(index,val) {
    this.z[index] = val;
    for(let i=0;i<this.arr.length;i++) this.arr[i].state[index] = val;
  }
  toString() {
    let pstate = a=>`${a[3]}/${a[5]}`;
    return pstate(this.z)+': '+this.arr.map((a,i)=>`${a.cmd}:`+pstate(a.state)+`[${a.count}]`).join(" ");
  }
}

const HEAD2 = Buffer.from([0x90,0x60]);
const ZERO4 = Buffer.from([0,0,0,0]);
const START4 = Buffer.from([0,0,0,1]);

class Q343Drone extends require('./drone.js').Drone {

  queue = new Queue([102,128,128,128,128,0,0,153]); // head,left/right,forward/backward,motor,turning movement,command,cheksum,end

  constructor() {
    super(config)
    this.sendInterval = null
    this.isenabled = false;  
  }

  connectedTime = 0;

  async onConnect(isconnected) {
    if(isconnected) {
      this.connectedTime = new Date().getTime();
      await this.enable()
      this.command_ = new dgram.createSocket("udp4")
      this.command_.on('error',data=>plog("onerror",data+""));
      this.command_.on('message',data=>plog("onmessage",data+""));
      await this.videoOn();
    } else {
      await this.disable() 
      await this.videoOff();
      delete this.command_;
    }
    await super.onConnect(isconnected);
  }

  async videoSend(b) {
    let sock = this.video_;
    if(!sock) return perr(sock);
    try {
      let ok = await new Promise(done=>{
        try {
          if(!sock.write(b,_=>done(true))) done(false);
        } catch(x) { perr(x); done(false); }
      });
      if(!ok) plog(b.length);
    } catch(x) { perr(x); }
  }

  async videoOn() {
    await this.videoOff();
    fs.writeFileSync("q.h264",Buffer.from([]));
    let b1 = Buffer.from([0x7e,0x0f,0x10,0x11,0x00,0x06,0x68,0x6f,0x6e,0x67,0x62,0x6f,0x08,0x32,0x30,0x31,0x35,0x30,0x31,0x30,0x31,0x10,0x0d]);
    let b2 = Buffer.from([0x7e,0x0f,0x17,0x05,0x00,0x61,0x9b,0xd3,0x9e,0xbd,0x0d]);
    let b3 = Buffer.from([0x7e,0x0f,0x11,0x04,0x00,0x00,0x00,0x00,0x31,0x0d]);
    this.video_ = await new Promise(done=>{
      let sock = new net.Socket();
      sock.once("error",a=>{
        plog(a);
        sock.destroy();
        done(null);
      });
      sock.once("connect",a=>{
        let fd = sock._handle ? sock._handle.fd : null;
        if(!fd) plog("no fd");
        done(sock);
      });
      sock.connect(6320,"192.179.8.1");
    });
    if(!this.video_) return perr("can't connect video");
    this.video_.on("error",a=>plog(a));
    await this.videoSend(b1);
    await this.videoSend(b2);

    let [ffin,ffout] = await super.start_ffmpeg();
    this.video_.on('data', async(data) => this.onvideodata(ffin,data));
    this.video_.on('close', async(_) => {
      dlog(`ffin.close`);
      ffin.destroy();
      await this.videoOff();
    });
    await this.videoSend(b3);
    if(1==1) {
      this.video_.setKeepAlive(true,10*1000);
      if(NetKeepAlive) {
        NetKeepAlive.setKeepAliveInterval(this.video_,10*1000)
        NetKeepAlive.setKeepAliveProbes(this.video_,3)
      }
    }
    this.timer = setInterval(async(_)=>await this.videoSend(b3),30*1000);
    app.startvideo(ffout);
  }

  async videoOff() {
    app.stopvideo();
    await super.stop_ffmpeg(true);
    if(this.timer) this.timer = clearTimeout(this.timer);
    if(this.video_) this.video_.destroy();
    delete this.video_;
  }

  vsync(data,i) {
    this.issync = false;
    for(;;i+=HEAD2.length) {
      let j = data.indexOf(HEAD2,i); // data: head[20]+len[2]+(startcode[4],NAL)[len] ..., head: 90 60 id=time[4] x[2], 0[4] x[2] 2 0, 0[4] 
      if(j==-1) return -1;
      if((j+22)>=data.length) return -1; 
      if(!data.slice(j+8,j+12).equals(ZERO4)) continue;
      this.issync = true;
      return j;
    }
  }

  onvideodata(out,data) {
    if(!this.buf) {
      this.issync = false;
      this.buf = Buffer.from([]); /// free
    }
    dlog(data.length,this.buf.length,this.issync);
    //await new Promise(done=>setTimeout(done,3000));
    //if(data.length>2000) plog(data.length,this.issync,this.buf.length);
    this.buf = Buffer.concat([this.buf,data]);
    let i = 0;
    if(!this.issync){
      if((i=this.vsync(this.buf,i))==-1) return; dlog(i);
      this.issync = true;
      this.buf = this.buf.slice(i);
    }
    for(;(i+22)<this.buf.length;) { // clean unnecessary
      let h = this.buf.slice(i,i+2);
      if(!h.equals(HEAD2)) {
        dlog(this.buf.slice(i,i+22));
        if((i=this.vsync(this.buf,i))==-1) return; dlog(i);
      } else {
        let n = this.buf.readUInt16LE(i+20);
        let j = i + n + 22;
        if(j>=this.buf.length) break;
        data = this.buf.slice(i+22,j);
        i = j;
        try {
          fs.appendFileSync("q.h264",data);
          if(!out.write(data)) flog("q.log","ffdrain",data.length);
        } catch(x) { perr(x); }
      }
    }
    this.buf = this.buf.slice(i);
  }

  enable() {
    this.isenabled = true
    this.sendInterval = setInterval(async()=>{
      //plog(this.queue.toString());
      let [state,cmd] = this.queue.get();
      if(config.fixstate) {
        state[1] += config.fixstate.right;
        state[2] += config.fixstate.forward;
        state[3] += config.fixstate.up;
        state[4] += config.fixstate.cw;
      }
      state[6] = state[1] ^ state[2] ^ state[3] ^ state[4] ^ state[5];
      let err = 0;
      err = await new Promise(done=>this.command_.send(Buffer.from(state),8898,config.ap,e=>done(e)));
      if(err) perr(err);
      if(1==1) {
        if(!this.old) this.old = [];
        if(!arrayEqual(this.old,state)) {
          let data = {motor:state[3],turn:state[4],left:state[1],forward:state[2],command:state[5],cmd:cmd,isenabled:this.isenabled};
          plog(JSON.stringify(data));
          wssend("showstate",Object.entries(data).map(a=>`${a[0]}:${a[1]}`).join(";"));
        }
        this.old = [...state];
      }
    },50);
    dlog(this.isenabled);
  }

  disable() {
    this.isenabled = false
    if(this.sendInterval) this.sendInterval = clearInterval(this.sendInterval)
    dlog(this.isenabled);
  }

  onknob(ax) {
    const aval = (a,b,x)=>{
      let t = Math.round(x*b);
      t = Math.max(t,a);
      t = Math.min(t,b);
      return 128+t;
    };
    let state = [102,128,128,128,128,this.queue.z[5],0,153];
    const limit = 20;
    if(ax.x2) state[1] = aval(-limit,limit,ax.x2); // right, gamepad values -1..1
    if(ax.y2) state[2] = aval(-limit,limit,-ax.y2); // front
    if(ax.y1) state[3] = aval(-limit,limit,-ax.y1); //aval(-128,127,-ax.y1); // motor
    if(ax.x1) state[4] = aval(-limit,limit,ax.x1); // cw
    this.queue.frontpush("gamepad",state);
  }

  takeoffed = false;

  setmotor(val) {
    this.queue.set(5,val);
    if(val==COMMAND_STOP_MOTOR) this.takeoffed = false;
  }

  tsend(cmd) {
    if(!this.command_||!cmd) return perr(cmd);
    let state = [102,128,128,128,128,this.queue.z[5],0,153];
    let set = (index,inc)=>{
       let t = state[index] + inc;
       if(t<0) t=0; else if(t>255) t=255;
       state[index] = t;
    };
    let qback = true;
    let cc = cmd.split(" ");
    let val = cc.length>1 ? atoi(cc[1]) : 0;
    let interval = cc.length>2 ? atoi(cc[2]) : 500;
    switch(cc[0]) {
     case "motor":
      state[3] = val;
      qback = false;
      break;
     case "gyro": state[5] = COMMAND_CALIBRATE_GYRO; break;
     case "left": set(1,val); break;
     case "right": set(1,-val); break;
     case "forward": set(2,val); break;
     case "back": set(2,-val); break;
     case "up": set(3,val); break;
     case "down": set(3,-val); break;
     case "cw": set(4,val); break;
     case "ccw": set(4,-val); break;
    }
    qback ? this.queue.backpush(cmd,state,interval/50) : this.queue.frontpush(cmd,state,interval/50);
  }

  async onkommand(acmd) {
    const arg = acmd.split(" ");
    let cmd;
    switch(arg[0]) {
      case 'e': 
        this.isenabled?this.disable():this.enable();
        return;
      case "m": 
        this.setmotor(this.queue.z[5]==COMMAND_START_MOTOR ? COMMAND_STOP_MOTOR : COMMAND_START_MOTOR);
        return;
      case "motor": 
        this.setmotor(parseInt(arg[1])?COMMAND_START_MOTOR:COMMAND_STOP_MOTOR); 
        return;
      case 'g': cmd = "gyro"; break;
      case 'gdown': case 'l':
        for(let m=10;m<128;m+=10) this.tsend(`down ${m}`);
        cmd = `motor ${COMMAND_STOP_MOTOR}`;
        this.takeoffed = false; // potolok
        break;
      case 'gup': case 't': 
        if(!this.takeoffed) {
          this.takeoffed = true;
          cmd = "motor 255 2000";
        }
        break;
      case "w": cmd = "up 1"; break;
      case "s": cmd = "down 1"; break;
      case "left": cmd = "left 1"; break;
      case "right": cmd = "right 1"; break;
      case "up": cmd = "forward 1"; break;
      case "down": cmd = "back 1"; break;
      case "a": cmd = "cw 1"; break;
      case "d": cmd = "ccw 1"; break;
      case "speed": return this.speed = arg[1] || 1;
    }
    plog(acmd,cmd);
    if(cmd) this.tsend(cmd);
  }

}

module.exports = {initModule,Drone:Q343Drone}
