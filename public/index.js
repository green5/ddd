global = window

function typeof_(a) {
  let t = typeof(a);
  if(t==="undefined") return "Undefined";
  if(a===null) return "Null";
  if(t=="object" && a.constructor) t = a.constructor.name;
  if(t=="string") return `${t}[${a.length}]`;
  if(t=="Buffer") return `${t}[${a.length}]`;
  if(t=="Array") return `${t}[${a.length}]`;
  //if(t=="Object") return `${t}{${Object.keys(a).length}}`;
  if(t=="Object") return `${t}{${Object.keys(a).length+':'+Object.keys(a).slice(0,2).join(',')}}`;
  return t;
}

function today(date,noday,notime) {
  if(typeof(date)=="string") return date;
  date = date ? (typeof_(date)=="Date" ? date : new Date(date)) : new Date();
  let ret = "";
  if(!noday) ret += [date.getFullYear(),date.getMonth()+1,date.getDate()].map(a=>(""+a).padStart(2,"0")).join("-");
  if(!notime) ret += (ret.length?"T":"") + [date.getHours(),date.getMinutes(),date.getSeconds()].map((a,i)=>a.toString().padStart(2,'0')).join(":") + '.' + date.getMilliseconds().toString().padStart(3,'0');
  return ret;
}


function line(maybeError,nstack) {
  nstack = 2 + (nstack ? nstack : 0);
  let err = maybeError && maybeError.stack ? maybeError : new Error;
  const originalPrepareStackTrace = Error.prepareStackTrace;
  Error.prepareStackTrace = (_, stack) => stack;
  err = err.stack;
  Error.prepareStackTrace = originalPrepareStackTrace;
  let ret = Array.isArray(err) ? err.map(a=>a.getFileName()+'.'+a.getLineNumber()+'.'+a.getFunctionName())[nstack].split("/").reverse()[0] : err;
  return today() + " " + ret + ": ";
}

window.dbg = true;
global.plog = (a,...b) => { console.log(line(a),a,...b); return a; }
global.plog.one = (a,...b) => { console.log(line(a,1),a,...b); return a; }
global.dlog = (a,...b) => { if(window.dbg) console.log(line(a),a,...b); return a; }
global.fire = (a) => Swal.fire({text:a,timer:1000});

async function wssend(msg,...etc)
{
  dlog(JSON.stringify(msg),...etc);
  if(window.websocket_) await window.websocket_.send(JSON.stringify(msg));
}

function refresh() {
  plog(window.location.href);
  window.location.href = window.location.href;
}

async function startws()
{
  if (window.websocket_) {
    plog('close ws');
    window.websocket_.close();
  }
  let url = (document.location.protocol.indexOf("https")==-1?"ws":"wss")+`://${document.location.host}/`;
  let sock = new WebSocket(url);
  window.websocket_ = sock;
  sock.onopen = function(a) {
    plog('ws.open',a);
  }  
  sock.onerror = function(a) {
    plog('ws.error',a);
  }
  sock.onclose = function(a) {
    plog(`ws.close`,a);
    delete window.websocket_;    
    if(window.wsreconnect) wsreconnect(0);
  }
  sock.onmessage = function (evt) {
    var d = jQuery.parseJSON(evt.data);
    if(d && d.func!="showstate") plog("ws.onmessage",typeof(d),d);
    if(typeof(d)=="string") {
      if(d=="home") refresh("/");
      else if(d=="refresh") refresh();
    } else if(typeof(d)=="object" && d.func && window[d.func] && Array.isArray(d.args)) {
      window[d.func](...d.args);
    }
  };
}

let state = {
  Gamepad: "off",
  //Date: today(),
  _startTime: new Date().getTime(),
  _lastTime: new Date().getTime(),
  _batold: null,
  _battime: null,
  _batval: '',
}

function ms2s(a) {
  let ms = a % 1000;
  a = (a - ms) / 1000;
  let s = a % 60;
  a = (a - s) / 60;
  let m = a % 60;
  let h = (a - m) / 60;
  return (h?h.toString().padStart(2,'0')+':':"") + (m?m.toString().padStart(2,'0')+':':"") + s.toString().padStart(2,'0') + '.' + ms.toString().padStart(3,'0');
}

function batshow(t,val) {
  if(val && state._batold!=val && (!state._batold||((state._batold-val)>0 && val<94))) {
    if(state._batold) state._batval = state._batold + ' ' + (((1100*3600*(state._batold-val)/100)/((t-state._battime)/1000))/1000/3.8).toFixed(3) + 'A';
    state._batold = val;
    state._battime = t;
  }
  return state._batval;
}

function showstate(s) {
  let t = new Date().getTime();
  state.Time = ms2s(t-state._startTime) + " " + ms2s(t-state._lastTime);
  state._lastTime = t;
  if(s) s.trim().split(";").filter(a=>!!a).map(p=>{
    let x = p.split(":");    
    if(x[0]=="bat") x[1] += " " + batshow(t,x[1]);
    else if(x[0]=="Speed" && window.gamepadSpeed) x[1] += "/" + window.gamepadSpeed.toFixed(1);
    else if(x[0]=="Sensitivity" && window.gamepadSensitivity) x[1] += "/" + window.gamepadSensitivity.toFixed(1);
    state[x[0]] = x[1];
  });
  $("#state").find("tbody").html(Object.entries(state).filter(t=>t[0] && t[0][0]!='_').map(t=>`<tr><td>${t[0]}<td>${t[1]}</tr>`));
}

function stopvideo() {
  //$('#img').css("dispaly","none").attr("src","");
  $('#img').css("dispaly","inherit").attr("src","/video.jpg");
}

function startvideo(path) {
  plog(path);
  $('#img').css("dispaly","inherit").attr("src",path);
}

function closewindow() {
  swal.fire({text:'Close?'
    ,confirmButtonText: 'Cancel'
    ,showCancelButton: true
    ,cancelButtonText: 'Ok'
    ,timer: 10*1000
    ,timerProgressBar:true
  }).then(a=>a.isConfirmed||window.close())
}

function startmenu(items) {
  // https://www.jqueryscript.net/menu/Menu-List-Generator-jQuery-renderMenu.html#google_vignette
  let $menu = $('#rootmenu').html("").menuList({data: items}); //renderizeMenu(items,{});
  $menu.smartmenus();
}

function beep() {
  let snd = new Audio("data:audio/wav;base64,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qJrx4KOQjahZxWbcZgztj2c49nKmkId44S71j0c8eV9yDK6uPRzx5X18eDvjvQ6yKo9ZSS6l//8elePK/Lf//IInrOF/FvDoADYAGBMGb7FtErm5MXMlmPAJQVgWta7Zx2go+8xJ0UiCb8LHHdftWyLJE0QIAIsI+UbXu67dZMjmgDGCGl1H+vpF4NSDckSIkk7Vd+sxEhBQMRU8j/12UIRhzSaUdQ+rQU5kGeFxm+hb1oh6pWWmv3uvmReDl0UnvtapVaIzo1jZbf/pD6ElLqSX+rUmOQNpJFa/r+sa4e/pBlAABoAAAAA3CUgShLdGIxsY7AUABPRrgCABdDuQ5GC7DqPQCgbbJUAoRSUj+NIEig0YfyWUho1VBBBA//uQZB4ABZx5zfMakeAAAAmwAAAAF5F3P0w9GtAAACfAAAAAwLhMDmAYWMgVEG1U0FIGCBgXBXAtfMH10000EEEEEECUBYln03TTTdNBDZopopYvrTTdNa325mImNg3TTPV9q3pmY0xoO6bv3r00y+IDGid/9aaaZTGMuj9mpu9Mpio1dXrr5HERTZSmqU36A3CumzN/9Robv/Xx4v9ijkSRSNLQhAWumap82WRSBUqXStV/YcS+XVLnSS+WLDroqArFkMEsAS+eWmrUzrO0oEmE40RlMZ5+ODIkAyKAGUwZ3mVKmcamcJnMW26MRPgUw6j+LkhyHGVGYjSUUKNpuJUQoOIAyDvEyG8S5yfK6dhZc0Tx1KI/gviKL6qvvFs1+bWtaz58uUNnryq6kt5RzOCkPWlVqVX2a/EEBUdU1KrXLf40GoiiFXK///qpoiDXrOgqDR38JB0bw7SoL+ZB9o1RCkQjQ2CBYZKd/+VJxZRRZlqSkKiws0WFxUyCwsKiMy7hUVFhIaCrNQsKkTIsLivwKKigsj8XYlwt/WKi2N4d//uQRCSAAjURNIHpMZBGYiaQPSYyAAABLAAAAAAAACWAAAAApUF/Mg+0aohSIRobBAsMlO//Kk4soosy1JSFRYWaLC4qZBYWFRGZdwqKiwkNBVmoWFSJkWFxX4FFRQWR+LsS4W/rFRb/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////VEFHAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAU291bmRib3kuZGUAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAMjAwNGh0dHA6Ly93d3cuc291bmRib3kuZGUAAAAAAAAAACU=");  
  new Promise(done=>done(snd.play()));
}

$(document).ready(_=>{
  const keymap = {
    ArrowLeft:"left",
    ArrowRight:"right",
    ArrowUp:"up",
    ArrowDown:"down",
  };
  startws();
  $(document).on("keydown",e=>{
    e = e.originalEvent;
    if(keymap[e.key]) wssend({key:keymap[e.key]})
  });
  $(document).on("keypress",e=>{
    e = e.originalEvent;
    wssend({key:e.key});
  });
  startGamepad();
  showstate();
});

