const fs = require('fs');
const os = require('os')
const util = require("util")
const path = require('path');
const child_process = require('child_process'); // https://nodejs.org/api/child_process.html
const shell = require('shelljs')
const { Readable, Writable, Duplex, Transform } = require('stream');

Object.defineProperty(Object.prototype,"first",{
  get: function(){return Array.isArray(this) ? this[0] : this.valueOf() },
  //set: function(){}
});

global.typeof_ = (a) => {
  if(a===null) return "Null";
  if(a===undefined) return "Undefined";
  let t = typeof(a);
  if(t=="function") return `Function.${a.name}`;
  if(t=="object" && a.constructor) t = a.constructor.name;
  if(t=="string") return `${t}[${a.length}]`;
  if(t=="String") return `${t}[${a.length}]`;
  if(t=="Buffer") return `${t}[${a.length}]`;
  if(t=="Array") return `${t}[${a.length}]`;
  if(t=="Object") return `${t}{${Object.keys(a).length+','+Object.keys(a).slice(0,3).join(',')}}`;
  if(t=="Uint8Array") return `${t}[${a.length}]`;
  return t;
}

global.today = (date,noday,notime) => {
  if(typeof(date)=="string") return date;
  date = date ? (typeof_(date)=="Date" ? date : new Date(date)) : new Date();
  let ret = "";
  if(!noday) ret += [date.getFullYear(),date.getMonth()+1,date.getDate()].map(a=>(""+a).padStart(2,"0")).join("-");
  if(!notime) ret += (ret.length?"T":"") + [date.getHours(),date.getMinutes(),date.getSeconds()].map((a,i)=>a.toString().padStart(2,'0')).join(":") + '.' + date.getMilliseconds().toString().padStart(3,'0');
  return ret;
}

global.getstack = (err) => {
  const originalPrepareStackTrace = Error.prepareStackTrace;
  Error.prepareStackTrace = (_, stack) => stack;
  let ret = err.stack;
  Error.prepareStackTrace = originalPrepareStackTrace;
  return ret;
}

let LINES = process.env.LINES ? parseInt(process.env.LINES) : 1;

global.line = (maybeError,nstack) => {
  nstack = 2 + (nstack ? nstack : 0);
  let iserr = maybeError && maybeError instanceof Error;
  let stack = getstack(iserr ? maybeError : new Error(typeof_(maybeError)));
  if(Array.isArray(stack)) stack = stack
      .slice(nstack,nstack+(isNaN(LINES)?1:LINES))
      .map(a=>{
    let ret = `${path.basename(a.getFileName() ?? "")}.${a.getLineNumber()}`
    if(a.getFunctionName()) ret += `.${a.getFunctionName()}`;
    return ret;
  }).reverse().join(" ");
  return "[" + process.pid + "]" + today() + ` ${stack}:`;
}

global.DEBUG = process.env.DEBUG ? parseInt(process.env.DEBUG) : 0;
let inspect = a => typeof(a)=="string"||(a && a.constructor.name=="Error")?a:util.inspect(a,{depth:null,compact:true,breakLength:Infinity});

global.nop = (a,...b) => {
  return a;
};
global.dlog = (a,...b) => {
  fs.appendFile("q.log",[line(a)].concat([a,...b].map(a=>inspect(a))).join(" ")+"\n",nop)
  if(DEBUG>0 && process.stderr.isTTY) process.stderr.write([line(a)].concat([a,...b].map(a=>inspect(a))).join(" ")+"\r\n");
  return a;
}
global.plog = (a,...b) => {
  fs.appendFile("q.log",[line(a)].concat([a,...b].map(a=>inspect(a))).join(" ")+"\n",nop)
  if(process.stderr.isTTY) process.stderr.write([line(a)].concat([a,...b].map(a=>inspect(a))).join(" ")+"\r\n");
  return a;
}
global.plog.one = (a,...b) => {
  fs.appendFile("q.log",[line(a,1)].concat([a,...b].map(a=>inspect(a))).join(" ")+"\n",nop)
  if(process.stderr.isTTY) process.stderr.write([line(a,1)].concat([a,...b].map(a=>inspect(a))).join(" ")+"\r\n");
  return a;
}
global.perr = (a,...b) => {
  fs.appendFile("q.log",[line(a)].concat([a,...b].map(a=>inspect(a))).join(" ")+"\n",nop)
  if(process.stderr.isTTY) process.stderr.write([line(a)].concat([a,...b].map(a=>inspect(a))).join(" ")+"\r\n");
  return a;
}
global.pexit = (a,...b) => {
  fs.appendFile("q.log",[line(a)].concat([a,...b].map(a=>inspect(a))).join(" ")+"\n",nop)
  if(process.stderr.isTTY) process.stderr.write([line(a)].concat([a,...b].map(a=>inspect(a))).join(" ")+"\r\n");
  process.exit(a && a instanceof Error ? 1 : 0);
  return a;
}
global.flog = (fn,a,...b) => {
  fs.appendFileSync(fn?fn:"q.log",[line(a)].concat([a,...b].map(a=>inspect(a))).join(" ")+"\n")
  return a;
}
global.onlog = (h,...ss) => {
  let i=-1;
  for(let s of ss) {
    let n = ++i;
    plog(`${h}-${n}`,typeof_(s));
    if(!s) continue;
    let t = s.constructor.name;
    if(t=="Socket") for(let e of ['close','connect','data','drain','end','error','lookup','ready','timeout']) s.on(e,a=>plog(`${h}-${n}:${t}.`+e,typeof_(a)));
    else if(t=="WriteStream") for(let e of ["close","drain","error","finish","pipe","unpipe"]) s.on(e,a=>plog(`${h}-${n}:${t}.`+e,typeof_(a)));
    else if(t=="ReadStream") for(let e of ["close","data","end","error","pause","readable","resume"]) s.on(e,a=>plog(`${h}-${n}:${t}.`+e,typeof_(a)));
    else plog(h,t,typeof_(s),n);
  }
}

global.atoi = (a,z) => {
  let t = parseInt(a);
  return isNaN(t) ? (z?z:0) : t;
}

global.atof = (a,z) => {
  let t = parseFloat(a);
  return isNaN(t) ? (z?z:0) : t;
}

global.waitFileSize = async(path,asize) => {
  await new Promise(done=>{
    fs.watch(path,async(eventType)=>{
      if(eventType=="change") {
        let stat = fs.statSync(path,{throwIfNoEntry:false});
        if(stat && stat.size>=asize) {
          dlog(`watch ${path} ${stat.size}`);
          fs.unwatchFile(path);
          done();
        }
      }
    });
  });
}

global.fileReadSync = (path,length,position) => {
  if(1==0) {
    let input = fs.createReadStream(this.path,{start:position,end:position+length});
    let ret = input.read();
    input.destroy();
    return ret;
  }
  try {
    let fd = fs.openSync(path);
    let ret = Buffer.alloc(length);
    let bytesRead = fs.readSync(fd,ret,0,length,position);
    fs.close(fd);
    if(bytesRead!=length) ret = Buffer.from(ret,0,bytesRead);
    dlog(path,length,position,bytesRead,typeof_(ret));
    return ret;
  } catch(x) {
    plog(x);
    return null;
  }
}

global.fileWriteSync = (path,buf,length,position) => {
  try {
    let fd = fs.openSync(path,'r+');
    let bytesWrite = fs.writeSync(fd,buf,0,length,position);
    fs.close(fd);
    if(bytesWrite!=length) plog(path,length,position,bytesWrite,typeof_(buf));
    return bytesWrite;
  } catch(x) {
    plog(x);
  }
}

class WatchReadable extends Readable {
  constructor(path,tmo,options) {
    super(options);
    this.path = path;
    this.tmo = tmo;
    this.size = 0;
    this.timer = null;
    this.watcher = null;
    this.retimer();
  }
  retimer() {
    if(this.tmo) {
      if(this.timer) clearTimeout(this.timer);
      this.timer = setInterval(_=>{
        plog(`timeout ${this.tmo}`,typeof_(this));
        clearTimeout(this.timer);
        this.push(null);
      },this.tmo);
    }
  }
  onchange() {
    let ret = false;
    let stat = fs.statSync(this.path,{throwIfNoEntry:false});
    if(stat && stat.size>this.size) {
      let b = fileReadSync(this.path,stat.size-this.size,this.size);
      if(b && b.length>0) {
        dlog(this.path,this.size,typeof_(b));
        this.size += b.length;
        this.push(b);
        ret = true;
        this.retimer();
      }
    }
    return ret;
  }
  _read(size) {
    if(!this.watcher) this.watcher = fs.watch(this.path,(eventType,fname)=>eventType=="change"?this.onchange():null); /// check rename ...
  }
  _destroy(err,callback) {
    if(this.timer) clearTimeout(this.timer);
    if(this.watcher) this.watcher.close();
    let ok = this.onchange();
    dlog("_destroy",ok);
    super._destroy(err,callback);
  }
};
global.WatchReadable = WatchReadable;

global.shell_exec = (cmd,opt,...a) => {
  if(os.platform()=="win32") cmd = cmd.replace(/\//g,'\\');
  return shell.exec(cmd,{...{silent:true},...opt},...a);
};
//if(process.stdout.isTTY) shell_exec("chcp 855"); // 437

global.scanf = (aa,ff)=>{
  let ret = [];  
  aa = aa.split(" ").filter(a=>!!a)
  let ok = true;
  ff.split(" ").filter(a=>!!a).map((a,i)=>{
    let t = aa[i];
    if(a[0]=='%') {
      if(a[1]=='d') t = parseInt(t);
      else if(a[1]=='f') t = parseFloat(t);
      if(ok) ret.push(t);
    }
    else {
      ok = ok && t==a;
    }
  });
  return ret;
}
