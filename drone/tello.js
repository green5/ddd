const os = require('os')
const fs = require('fs');
//const Tello = require("tello-drone");
//const sdk = require('tellojs')
const dgram = require('dgram')
const EventEmitter = require('events')
const udp = require('./udp.js')

let config;

function initModule(c) {
  config = c;
  return module.exports;
}

class CMD {
  constructor(text,code,type) {
    this.text = text;
    this.code = code;
    this.type = type;
  }
}

// from https://bitbucket.org/PingguSoft/pytello/src/master/ https://gitlab.com/Suphi/Tello.git
const TELLO_CMD_ERROR1 = new CMD("ERROR1",0x43,-1); // 67
const TELLO_CMD_ERROR2 = new CMD("ERROR2",0x44,-1); // 68
const TELLO_CMD_LIGHT_STRENGTH = new CMD("LIGHT_STRENGTH",0x35,-1); // 53
const TELLO_CMD_LOG_DATA_WRITE = new CMD("LOG_DATA_WRITE",0x1051,-1); // 4177
const TELLO_CMD_STATUS = new CMD("STATUS",0x56,-1); // 86

const TELLO_CMD_SSID = new CMD("SSID",0x11,0x48); // 17
const TELLO_CMD_SET_SSID = new CMD("SET_SSID",0x12,0x68); // 18
const TELLO_CMD_SSID_PASS = new CMD("SSID_PASS",0x13,0x48); // 19
const TELLO_CMD_SET_SSID_PASS = new CMD("SET_SSID_PASS",0x14,0x68); // 20
const TELLO_CMD_REGION = new CMD("REGION",0x15,0x48); // 21
const TELLO_CMD_SET_REGION = new CMD("SET_REGION",0x16,0x68); // 22
const TELLO_CMD_WIFI_SIGNAL = new CMD("WIFI_SIGNAL",0x1a,0x48); // 26
const TELLO_CMD_SET_VIDEO_BIT_RATE = new CMD("SET_VIDEO_BIT_RATE",0x20,0x68); // 32
const TELLO_CMD_SET_DYN_ADJ_RATE = new CMD("SET_DYN_ADJ_RATE",0x21,0x68); // 33
const TELLO_CMD_SET_EIS = new CMD("SET_EIS",0x24,0x68); // 36
const TELLO_CMD_REQ_VIDEO_SPS_PPS = new CMD("REQ_VIDEO_SPS_PPS",0x25,0x60); // 37
const TELLO_CMD_VIDEO_BIT_RATE = new CMD("VIDEO_BIT_RATE",0x28,0x48); // 40
const TELLO_CMD_TAKE_PICTURE = new CMD("TAKE_PICTURE",0x30,0x68); // 48
const TELLO_CMD_SWITCH_PICTURE_VIDEO = new CMD("SWITCH_PICTURE_VIDEO",0x31,0x68); // 49
const TELLO_CMD_START_RECORDING = new CMD("START_RECORDING",0x32,0x68); // 50
const TELLO_CMD_SET_EV = new CMD("SET_EV",0x34,0x48); // 52
const TELLO_CMD_SET_JPEG_QUALITY = new CMD("SET_JPEG_QUALITY",0x37,0x68); // 55
const TELLO_CMD_VERSION = new CMD("VERSION",0x45,0x48); // 69
const TELLO_CMD_DATE_TIME = new CMD("DATE_TIME",0x46,0x50); // 70
const TELLO_CMD_ACTIVATION_TIME = new CMD("ACTIVATION_TIME",0x47,0x48); // 71
const TELLO_CMD_LOADER_VERSION = new CMD("LOADER_VERSION",0x49,0x48); // 73
const TELLO_CMD_STICK = new CMD("STICK",0x50,0x60); // 80
const TELLO_CMD_TAKEOFF = new CMD("TAKEOFF",0x54,0x68); // 84
const TELLO_CMD_LANDING = new CMD("LANDING",0x55,0x68); // 85
const TELLO_CMD_SET_ALT_LIMIT = new CMD("SET_ALT_LIMIT",0x58,0x68); // 88
const TELLO_CMD_HANDLE_IMU_ANGLE = new CMD("HANDLE_IMU_ANGLE",0x5a,0x48); // 90
const TELLO_CMD_FLIP = new CMD("FLIP",0x5c,0x70); // 92
const TELLO_CMD_THROW_FLY = new CMD("THROW_FLY",0x5d,0x48); // 93
const TELLO_CMD_PALM_LANDING = new CMD("PALM_LANDING",0x5e,0x48); // 94
const TELLO_CMD_FILE_SIZE = new CMD("FILE_SIZE",0x62,0x50); // 98
const TELLO_CMD_FILE_DATA = new CMD("FILE_DATA",0x63,0x50); // 99
const TELLO_CMD_FILE_COMPLETE = new CMD("FILE_COMPLETE",0x64,0x48); // 100
const TELLO_CMD_SMART_VIDEO_START = new CMD("SMART_VIDEO_START",0x80,0x68); // 128
const TELLO_CMD_SMART_VIDEO_STATUS = new CMD("SMART_VIDEO_STATUS",0x81,0x50); // 129
const TELLO_CMD_LOG_HEADER_WRITE = new CMD("LOG_HEADER_WRITE",0x1050,0x50); // 4176
const TELLO_CMD_LOG_CONFIGURATION = new CMD("LOG_CONFIGURATION",0x1052,0x50); // 4178
const TELLO_CMD_BOUNCE = new CMD("BOUNCE",0x1053,0x68); // 4179
const TELLO_CMD_PLANE_CALIBRATION = new CMD("PLANE_CALIBRATION",0x1054,0x68); // 4180
const TELLO_CMD_SET_LOW_BATTERY_THRESHOLD = new CMD("SET_LOW_BATTERY_THRESHOLD",0x1055,0x68); // 4181
const TELLO_CMD_ALT_LIMIT = new CMD("ALT_LIMIT",0x1056,0x48); // 4182
const TELLO_CMD_LOW_BATT_THRESHOLD = new CMD("LOW_BATT_THRESHOLD",0x1057,0x48); // 4183
const TELLO_CMD_SET_ATTITUDE_ANGLE = new CMD("SET_ATTITUDE_ANGLE",0x1058,0x68); // 4184
const TELLO_CMD_ATT_ANGLE = new CMD("ATT_ANGLE",0x1059,0x48); // 4185

const bget = {
  [TELLO_CMD_WIFI_SIGNAL.text]:    b => Buffer.isBuffer(b) && b.length>2 ? b.readUInt16LE(1) : b,
  [TELLO_CMD_VIDEO_BIT_RATE.text]: b => Buffer.isBuffer(b) && b.length>1 ? b.readUInt16LE(0).toString() : b,
  [TELLO_CMD_ALT_LIMIT.text]:      b => Buffer.isBuffer(b) && b.length>2 ? b.readUInt16LE(1) : b,
  [TELLO_CMD_VERSION.text]:        b => Buffer.isBuffer(b) ? b.slice(1).toString().split(String.fromCharCode(0))[0] : b,
};

const table8 = [ // https://gitlab.com/Suphi/Tello.git
    0x00, 0x5e, 0xbc, 0xe2, 0x61, 0x3f, 0xdd, 0x83, 0xc2, 0x9c, 0x7e, 0x20, 0xa3, 0xfd, 0x1f, 0x41,
    0x9d, 0xc3, 0x21, 0x7f, 0xfc, 0xa2, 0x40, 0x1e, 0x5f, 0x01, 0xe3, 0xbd, 0x3e, 0x60, 0x82, 0xdc,
    0x23, 0x7d, 0x9f, 0xc1, 0x42, 0x1c, 0xfe, 0xa0, 0xe1, 0xbf, 0x5d, 0x03, 0x80, 0xde, 0x3c, 0x62,
    0xbe, 0xe0, 0x02, 0x5c, 0xdf, 0x81, 0x63, 0x3d, 0x7c, 0x22, 0xc0, 0x9e, 0x1d, 0x43, 0xa1, 0xff,
    0x46, 0x18, 0xfa, 0xa4, 0x27, 0x79, 0x9b, 0xc5, 0x84, 0xda, 0x38, 0x66, 0xe5, 0xbb, 0x59, 0x07,
    0xdb, 0x85, 0x67, 0x39, 0xba, 0xe4, 0x06, 0x58, 0x19, 0x47, 0xa5, 0xfb, 0x78, 0x26, 0xc4, 0x9a,
    0x65, 0x3b, 0xd9, 0x87, 0x04, 0x5a, 0xb8, 0xe6, 0xa7, 0xf9, 0x1b, 0x45, 0xc6, 0x98, 0x7a, 0x24,
    0xf8, 0xa6, 0x44, 0x1a, 0x99, 0xc7, 0x25, 0x7b, 0x3a, 0x64, 0x86, 0xd8, 0x5b, 0x05, 0xe7, 0xb9,
    0x8c, 0xd2, 0x30, 0x6e, 0xed, 0xb3, 0x51, 0x0f, 0x4e, 0x10, 0xf2, 0xac, 0x2f, 0x71, 0x93, 0xcd,
    0x11, 0x4f, 0xad, 0xf3, 0x70, 0x2e, 0xcc, 0x92, 0xd3, 0x8d, 0x6f, 0x31, 0xb2, 0xec, 0x0e, 0x50,
    0xaf, 0xf1, 0x13, 0x4d, 0xce, 0x90, 0x72, 0x2c, 0x6d, 0x33, 0xd1, 0x8f, 0x0c, 0x52, 0xb0, 0xee,
    0x32, 0x6c, 0x8e, 0xd0, 0x53, 0x0d, 0xef, 0xb1, 0xf0, 0xae, 0x4c, 0x12, 0x91, 0xcf, 0x2d, 0x73,
    0xca, 0x94, 0x76, 0x28, 0xab, 0xf5, 0x17, 0x49, 0x08, 0x56, 0xb4, 0xea, 0x69, 0x37, 0xd5, 0x8b,
    0x57, 0x09, 0xeb, 0xb5, 0x36, 0x68, 0x8a, 0xd4, 0x95, 0xcb, 0x29, 0x77, 0xf4, 0xaa, 0x48, 0x16,
    0xe9, 0xb7, 0x55, 0x0b, 0x88, 0xd6, 0x34, 0x6a, 0x2b, 0x75, 0x97, 0xc9, 0x4a, 0x14, 0xf6, 0xa8,
    0x74, 0x2a, 0xc8, 0x96, 0x15, 0x4b, 0xa9, 0xf7, 0xb6, 0xe8, 0x0a, 0x54, 0xd7, 0x89, 0x6b, 0x35,
];

const table16 = [
    0x0000, 0x1189, 0x2312, 0x329b, 0x4624, 0x57ad, 0x6536, 0x74bf, 0x8c48, 0x9dc1, 0xaf5a, 0xbed3, 0xca6c, 0xdbe5, 0xe97e, 0xf8f7,
    0x1081, 0x0108, 0x3393, 0x221a, 0x56a5, 0x472c, 0x75b7, 0x643e, 0x9cc9, 0x8d40, 0xbfdb, 0xae52, 0xdaed, 0xcb64, 0xf9ff, 0xe876,
    0x2102, 0x308b, 0x0210, 0x1399, 0x6726, 0x76af, 0x4434, 0x55bd, 0xad4a, 0xbcc3, 0x8e58, 0x9fd1, 0xeb6e, 0xfae7, 0xc87c, 0xd9f5,
    0x3183, 0x200a, 0x1291, 0x0318, 0x77a7, 0x662e, 0x54b5, 0x453c, 0xbdcb, 0xac42, 0x9ed9, 0x8f50, 0xfbef, 0xea66, 0xd8fd, 0xc974,
    0x4204, 0x538d, 0x6116, 0x709f, 0x0420, 0x15a9, 0x2732, 0x36bb, 0xce4c, 0xdfc5, 0xed5e, 0xfcd7, 0x8868, 0x99e1, 0xab7a, 0xbaf3,
    0x5285, 0x430c, 0x7197, 0x601e, 0x14a1, 0x0528, 0x37b3, 0x263a, 0xdecd, 0xcf44, 0xfddf, 0xec56, 0x98e9, 0x8960, 0xbbfb, 0xaa72,
    0x6306, 0x728f, 0x4014, 0x519d, 0x2522, 0x34ab, 0x0630, 0x17b9, 0xef4e, 0xfec7, 0xcc5c, 0xddd5, 0xa96a, 0xb8e3, 0x8a78, 0x9bf1,
    0x7387, 0x620e, 0x5095, 0x411c, 0x35a3, 0x242a, 0x16b1, 0x0738, 0xffcf, 0xee46, 0xdcdd, 0xcd54, 0xb9eb, 0xa862, 0x9af9, 0x8b70,
    0x8408, 0x9581, 0xa71a, 0xb693, 0xc22c, 0xd3a5, 0xe13e, 0xf0b7, 0x0840, 0x19c9, 0x2b52, 0x3adb, 0x4e64, 0x5fed, 0x6d76, 0x7cff,
    0x9489, 0x8500, 0xb79b, 0xa612, 0xd2ad, 0xc324, 0xf1bf, 0xe036, 0x18c1, 0x0948, 0x3bd3, 0x2a5a, 0x5ee5, 0x4f6c, 0x7df7, 0x6c7e,
    0xa50a, 0xb483, 0x8618, 0x9791, 0xe32e, 0xf2a7, 0xc03c, 0xd1b5, 0x2942, 0x38cb, 0x0a50, 0x1bd9, 0x6f66, 0x7eef, 0x4c74, 0x5dfd,
    0xb58b, 0xa402, 0x9699, 0x8710, 0xf3af, 0xe226, 0xd0bd, 0xc134, 0x39c3, 0x284a, 0x1ad1, 0x0b58, 0x7fe7, 0x6e6e, 0x5cf5, 0x4d7c,
    0xc60c, 0xd785, 0xe51e, 0xf497, 0x8028, 0x91a1, 0xa33a, 0xb2b3, 0x4a44, 0x5bcd, 0x6956, 0x78df, 0x0c60, 0x1de9, 0x2f72, 0x3efb,
    0xd68d, 0xc704, 0xf59f, 0xe416, 0x90a9, 0x8120, 0xb3bb, 0xa232, 0x5ac5, 0x4b4c, 0x79d7, 0x685e, 0x1ce1, 0x0d68, 0x3ff3, 0x2e7a,
    0xe70e, 0xf687, 0xc41c, 0xd595, 0xa12a, 0xb0a3, 0x8238, 0x93b1, 0x6b46, 0x7acf, 0x4854, 0x59dd, 0x2d62, 0x3ceb, 0x0e70, 0x1ff9,
    0xf78f, 0xe606, 0xd49d, 0xc514, 0xb1ab, 0xa022, 0x92b9, 0x8330, 0x7bc7, 0x6a4e, 0x58d5, 0x495c, 0x3de3, 0x2c6a, 0x1ef1, 0x0f78,
];

function crc1(message,length) {
  let i = 0;
  let crc = 0x77;
  for (i = 0; i < length; i++) crc = table8[(crc ^ message[i]) & 0xFF];
  return crc;
}

function crc2(message,length) {
  let i = 0;
  let crc = 0x3692;
  for (i = 0; i < length; i++) crc = table16[(crc ^ message[i]) & 0xFF] ^ (crc >> 8);
  return crc;
}

ucfirst = (str) => str ? str.replace(/^\s*(<.*>)*(\S)(\S*)/, function(m,p1,p2,p3) { return (p1??"")+(p2??"").toUpperCase()+(p3??"").toLowerCase() }) : "";

class TelloDrone extends require('./drone.js').Drone {

  constructor() {
    super(config)
    this.kommand = {
    ["motor %d"]:a=>a?"motoron":"motoroff",
    ["video %d"]:a=>a?"streamon":"streamoff",
    ["camera %d"]:a=>`downvision ${a||0}`,
    ["start %d"]:a=>a?"takeoff":"land",
    }
  }

  async close() {
    await udp.closeall(this);
  }

  async onConnect(isconnected) {
    await super.onConnect(isconnected);
    if(!isconnected) {
      if(this.kperiodic) clearTimeout(this.kperiodic);
      await this.videoOff();
      await udp.closeall(this);
      return;
    }
    await udp.closeall(this);
    this.state_ = await udp.bind(this,8890,data=>{
      //dlog("state",typeof_(data),data);
      data = data.toString().trim(); // text?
      data = data+Object.entries(this.currentState).map(a=>`${a[0]}:${a[1]}`).join(";");
      wssend("showstate",data);
    });
    this.command_ = await udp.bind(this,8001,data=>{
      dlog("command",typeof_(data),data);
    },(data,rinfo)=>dlog(`${rinfo.address}:${rinfo.port}`,data,udp.toprintable(data)));
    let ack = await this.tcall('conn_req:!!');
    if(ack!='conn_ack:!!') plog("ack",ack);
    if(1==1) {
      for(let a of [TELLO_CMD_VERSION,TELLO_CMD_ALT_LIMIT]) {
        let get = bget[a.text];
        if(get) { 
          let b = await this.bcall(a);
          //dlog(a.text,typeof_(b),b,"bget",get(b));
          if(b) this.currentState[a.text] = get(b);
        }
      }
    }
    let periodic = async() => {
      if(1==1) {
        await this.tcall("command");
        for(let a of ["wifi?"]) {
          let t = await this.tcall(a);
          if(t) this.currentState[a] = t.toString().trim()+'%'; 
        }
        //this.onknob({});
      }
      if(app.platform=="win32") (await new Promise(done=>shell_exec('netsh wlan show interfaces',{},(code,stdout,stderr)=>done(stdout)))).split("\r\n").filter(a=>a.indexOf("Signal")>=0).map((a,i)=>this.currentState[`wifi-${i}`] = a.split(" ").filter(a=>!!a)[2]);
      if(app.platform=="linux") (await new Promise(done=>shell_exec("iwconfig 2>/dev/null | grep 'Link Quality='",{},(code,stdout,stderr)=>done(stdout.trim())))).replace('Quality','level').replace(/[^ ]+ level=/g,' ').split("\n").map((a,i)=>this.currentState[`wifi-${i}`] = a.trim());
      this.kperiodic = setTimeout(_=>periodic(),14000); // 15s
    };
    periodic();
    await this.videoOn();
  }

  async videoOn() {
    this.video_ = await udp.bind(this,11111);
    if(!this.video_) throw new Error("videoBind");
    await this.tcall("streamon");
    let id = 0;
    if(!this.ff) {
      fs.writeFileSync("q.h264",Buffer.from([]));
      let [ffin,ffout] = await super.start_ffmpeg();
      let t1 = new Date().getTime()/1000;
      let ii=-1, nn=0;
      this.video_.on('message',async(data)=>{
        ++ii;
        if(data[0]==0 && data[1]==0 && data[2]==0 && data[3]==1) ++nn;
        //dlog(data[0],data[1],data[2],data[3],data.length,ii,nn);
        fs.appendFileSync("q.h264",data);
        if(!ffin.write(data)) {}
        let tt = new Date().getTime()/1000 - t1;
        if(tt>=3) {
          this.currentState["FPS"] = (nn/tt).toFixed(0) + (app.oFPS?"/"+app.oFPS:"");
          t1 = new Date().getTime()/1000;
          nn = 0;
        }
      });
    }
    app.startvideo(this.ff.stdout);
  }

  async videoOff() {
    app.stopvideo();
    await this.tcall("streamoff");
    await super.stop_ffmpeg(true);
    if(this.video_) {
      await udp.close(this.video_);
      delete this.video_;
    }
  }

  async TakeOff() { return await this.tcall("takeoff") }
  async Land() { return await this.tcall("land") }

  sequence = 0;

  build(bcmd,data) {
    const [cmd,type] = [bcmd.code,bcmd.type];
    if(type<0) perr(`bad type ${cmd}`);
    if(!data) data = [];
    let len = 11 + data.length; // 9+data+2
    let seq = cmd==TELLO_CMD_STICK.code ? 0 : this.sequence++;
    let buf = [204,len<<3,len>>5,0,type,cmd,cmd>>8,seq,seq>>8,...data].map(x=>x&255); // data: Array Buffer or ...
    buf[3] = crc1(buf,3);
    let crc = crc2(buf,len-2);
    buf.push(crc&255);
    buf.push((crc>>8)&255);
    return {text:bcmd.text,cmd,type,seq,buf};
  }

  decode(buf) {
    if(!buf) return dlog(buf,"decode null");
    if(buf[0]!=0xcc) return buf; //dlog(buf,"decode cc 0x"+buf[0].toString(16));
    if(buf.length<11) return dlog(buf,`decode length ${buf.length}`);
    let len = buf.readUInt16LE(1)>>3;
    if(crc1(buf,3)!=buf[3]) perr(crc1(buf,3),buf[3]);
    let type = buf[4];
    let cmd = buf.readUInt16LE(5);
    let seq = buf.readUInt16LE(7);
    let data = buf.subarray(9,9+len-11);
    if(crc2(buf,len-2)!=buf.readUInt16LE(9+len-11)) perr(crc2(buf,len-2),buf.readUInt16LE(9+len-11));
    return {cmd,seq,type,data};
  }

  async bcall(bcmd,data,timeout) {
    if(!this.isconnected) return "disconnected";
    if(bcmd.code==TELLO_CMD_TAKEOFF.code) wssend("vibration");
    let bin = this.build(bcmd,data);
    let t1 = new Date().getTime();
    let ret = await udp.call(this.command_,bcmd.text,Buffer.from(bin.buf),8889,this.ap,timeout?timeout:1,4096,b=>{
      if(!b||!b.length||b[0]!=0xcc) return;
      let t = this.decode(b);
      if(!t.data) return;
      //dlog(bin,t);
      if(bin.seq==t.seq && bin.cmd==t.cmd) return t.data;
    });
    if(ret && (ret=="ok"||ret=="error")) ret = `${ret}: bcmd ${bcmd.text} sec ${((new Date().getTime()-t1)/1000).toFixed(3)}` ;
    return ret;
  }

  async tcall(cmd,timeout) {
    if(!this.isconnected) return "disconnected";
    let t1 = new Date().getTime();
    let ret = await udp.call(this.command_,cmd,Buffer.from(cmd),8889,this.ap,timeout?timeout:1,4096);
    dlog(cmd,ret);
    ret = udp.toprintable(ret);
    if(ret=="ok"||ret=="error") ret = `${ret}: cmd ${cmd} sec ${((new Date().getTime()-t1)/1000).toFixed(3)}`;
    return ret;
  }

  bsend(bcmd,data) {
    if(!this.isconnected) return "disconnected";
    let bin = this.build(bcmd,data);
    let t1 = new Date().getTime();
    udp.send(this.command_,Buffer.from(bin.buf),8889,this.ap);
    if(bcmd.code==TELLO_CMD_TAKEOFF.code) wssend("vibration");
    return "sended";
  }

  onknob(pos) {
    const aval = (l,x)=>{
      let t = x*l;
      t = Math.max(t,-l);
      t = Math.min(t,l);
      return t;
    };
    if(!pos.speed) pos.speed = this.currentState.Speed; // is used?
    if(!pos.sensitivity) pos.sensitivity = this.currentState.Sensitivity;
    let speed = Math.round(aval(2047,pos.speed));
    let sensitivity = aval(1,pos.sensitivity); // lt,rt=0..1
    let [x1,y1,x2,y2] = [pos.x1||0,pos.y1||0,pos.x2||0,pos.y2||0].map(a=>parseFloat(a.toFixed(4))).map(a=>Math.round(1024+aval(sensitivity*1024,a))); // 0..2040
    if(x1!=1024||y1!=1024||y2!=1024||x2!=1024) dlog({x1:x1-1024,y1:y1-1024,x2:x2-1024,y2:y2-1024,speed,sensitivity}); 
    if(!this.isconnected) return;
    let a = (BigInt(speed&0x7ff) << 44n) | (BigInt(x1&0x7ff) << 33n) | (BigInt(y1&0x7ff) << 22n) | (BigInt(y2&0x7ff) << 11n) | BigInt(x2&0x7ff);
    let b = Buffer.allocUnsafe(8);
    b.writeBigUInt64LE(a);
    b = b.slice(0,6);
    let d = new Date();
    b = Buffer.concat([b,Buffer.from([d.getHours(),d.getMinutes(),d.getSeconds(),d.getMilliseconds()&255,(d.getMilliseconds()>>8)&255])],11);
    return this.bsend(TELLO_CMD_STICK,b);
  }

  async setfps(n) {
    n = n==0 ? "low" : n==1 ? "middle" : "high";
    return await this.onkommand(`setfps ${n}`);
  }

  async onkommand(cmd) {
    let ret = "busy";
    let timeout = 1;
    let barg = [];
    if(!this.kbusy) {
      this.kbusy = true;
      let arg = cmd.split(" ");
      switch(arg[0]) {
        case "c": cmd = "command"; break;
        case "takeoff": cmd = TELLO_CMD_TAKEOFF; break;
        case "land": cmd = TELLO_CMD_LANDING; barg = [0]; break;
        case "alt": cmd = TELLO_CMD_SET_ALT_LIMIT; barg = arg[1] ? [parseInt(arg[1])&255,parseInt(arg[1])>>8] : null; break;
        case "ack": cmd = 'conn_req:VV'; break;
      }
      ret = cmd instanceof CMD ? this.bcall(cmd,barg,timeout) : await this.tcall(cmd,timeout);
      dlog({cmd,ret});
      this.kbusy = false;
    }
    return ret;
  }
}

module.exports = {initModule,Drone:TelloDrone}

/*
command
takeoff
land
streamon
streamoff
emergency
up x
down x
left x
right x
forward x
back x
cw x
ccw x
motoron
motoroff
throwfly
flip x
go x y z speed
stop
curve x1 y1 z1 x2 y2 
z2 speed
go x y z speed mid
curve x1 y1 z1 x2 y2 
z2 speed mid
jump x y z speed yaw 
reboot
speed x
rc a b c d
wifi ssid pass
mon
moff
mdirection x
ap ssid pass
wifisetchannel xxx
port info vedio
setfps fps
setbitrate bitrate
setresolution 
resolution
speed?
battery?
time?
wifi?
sdk?
sn?
hardware?
wifiversion?
ap?
ssid?
multiwifi ssid pass
*/

/// wlan: set private network or check firewall
// 'unknown command: land`P'
// 2 wifi klients?

