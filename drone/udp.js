const dgram = require('dgram')

function toprintable(a) {
  if(a && a.constructor.name=="String") {
    let t = "";
    for(let c of a) c = c.charCodeAt(0), t += c>=0x20 && c<0x127 ? String.fromCharCode(c) : '.';
    return t;
  }
  if(a && a.constructor.name=="Buffer") {
    let t = "";
    for(let c of a) t += c>=0x20 && c<0x127 ? String.fromCharCode(c) : '.';
    return t;
  }
  return a;
}

class Deferred {
  constructor(timeout,isresolve,text) {
    this.promise = new Promise((resolve, reject)=> {
      this.reject = reject
      this.resolve = resolve
      this.isresolve = isresolve
      this.notdone = true;
      this.text = text;
      this.timeout = setTimeout(()=>this.once(`timeout ${timeout}`),1000*timeout);
    })
  }
  once(a) {
    if(this.notdone) {
      if(this.isresolve && Buffer.isBuffer(a)) {
        let b = this.isresolve(a);
        if(!b) return dlog(`skip[${this.text}]`,typeof_(a),toprintable(a));
        a = b;
      }
      this.notdone = false
      clearTimeout(this.timeout);
      this.resolve(a||"Zero");  
    }
  }
}

async function bind(self,port,onmessage,islog) {
  return await new Promise(done=>{
    let fd = dgram.createSocket('udp4')
    if(port<0) return done(fd);
    fd.once('error',e=>{
      dlog(port,e);
      done(null)
    });
    fd.bind(port,_=>{
      if(!self.udp_sockets) self.udp_sockets = [];
      self.udp_sockets.push(fd);
      fd.on('error',a=>dlog(port,"onerror",a));
      fd.on('close',a=>dlog(port,"onclose",a));
      if(onmessage) fd.on('message',(data,rinfo)=>{
        if(islog) islog(data,rinfo);
        if(fd.deferred) fd.deferred.once(data); else onmessage(data);
      });
      done(fd)
    })
  });
}

function send(fd,buf,port,addr) {
  fd.send(buf,0,buf.length,port,addr,e=>e?perr(e):null);
}

async function call(fd,text,buf,port,addr,timeout,len,isresolve) {
  let res;
  try {
    fd.deferred = new Deferred(timeout,isresolve,text);
    send(fd,buf,port,addr);
    res = await fd.deferred.promise;
    delete fd.deferred;
  } catch(x) { 
    res = x.toString();
  }
  return res;
}

async function close(fd) {
  fd.removeAllListeners();
  if(!fd.isclosed) await new Promise(done=>fd.close(done));
  fd.isclosed = true;
}

async function closeall(self) {
  if(self.udp_sockets) {
    dlog("closeall",self.udp_sockets.length);
    for(let i in self.udp_sockets) {
      let fd = self.udp_sockets[i];
      delete self.udp_sockets[i];
      close(fd);
    }
    delete self.udp_sockets;
  }
}

module.exports = {bind,send,call,closeall,close,toprintable}
