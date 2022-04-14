/// connerct gamepad by button, not stick

function vibration(g) {
  if(arguments.length==1) {
    if(g.vibrationActuator && g.vibrationActuator.playEffect) g.vibrationActuator.playEffect('dual-rumble',{
      startDelay: 0,
      duration: 1000,
      weakMagnitude: 1,
      strongMagnitude: 1
    });
  } else if(typeof(navigator.getGamepads)=="function") {
    let gg = navigator.getGamepads();
    for(let n=0;n<gg.length;n++) if(gg[n]) vibration(gg[n]);
  } else {
    plog("no gamepads");
  }
}

function readgamepad(g,old) {
  let pos = [], key = [], val = [];
  for(let i=0;i<g.axes.length;i++) pos[i] = g.axes[i];
  pos = pos.map((a,i)=>a-(old.fixpos[i]||0));
  for(let i=0;i<g.buttons.length;i++) {
    let pressed = g.buttons[i].pressed;
    let value = g.buttons[i].value;
    key[i] = pressed && old.key[i]!=pressed;
    val[i] = value;
    //if(i==6 && pressed) plog(pressed,value);
    old.key[i] = pressed;
  }
  return {pos:pos,key:key,val:val}
}

function t4pro(msg) {
  let pos = {};
  if(msg.pos[0]) pos.x1 = msg.pos[0];
  if(msg.pos[1]) pos.y1 = -msg.pos[1];
  if(msg.pos[2]) pos.x2 = msg.pos[2];
  if(msg.pos[3]) pos.y2 = -msg.pos[3];
  let speed = msg.val[7]; // RT
  let sensitivity = msg.val[6]; // LT 0..1
  if(speed>0) pos.speed = speed;  
  if(sensitivity>0) pos.sensitivity = sensitivity;
  window.gamepadSpeed = pos.speed;
  window.gamepadSensitivity = pos.sensitivity;
  const keymap = {
    [0]:"land", //A
    [1]:"180", //B
    [2]:"-180", //X
    [3]:"takeoff", //Y
    [4]:"nextsensitivity", //LB
    [5]:"nextspeed", //RB
    [8]:"stream", //start
    [9]:"vision", //select
    [12]:"flip f",
    [13]:"flip b",
    [14]:"flip l",
    [15]:"flip r",
  };
  return {pos:pos,key:msg.key.map((a,i)=>a?keymap[i]:false).filter(a=>!!a).join("+")}
}

function snes(msg) { // SNES Gamepad
  const keymap = {
    [0]:"forward", //X
    [1]:"right", //A
    [2]:"back", //B
    [3]:"left", //Y
    [4]:"nextsensitivity", //L
    [5]:"nextspeed", //R
    [8]:"land", //select
    [9]:"takeoff", //start
  };
  let pos = {};
  if(msg.pos[0]) pos.x1 = msg.pos[0];
  if(msg.pos[1]) pos.y1 = -msg.pos[1];
  return {pos:pos,key:msg.key.map((a,i)=>a?keymap[i]:false).filter(a=>!!a).join("+")}
}

function unknown(msg) {
  let pos = {};
  msg.pos.map((x,i)=>x?pos["a"+i]=x:x);
  return {pos:pos,key:msg.key.map((a,i)=>a?`b${i}`:false).filter(a=>!!a).join("+")}
}

let gamepads = {
  ["MEC0003 (Vendor: 0001 Product: 0000)"]: null,
  ["Xbox 360 Controller (XInput STANDARD GAMEPAD)"]: {read:t4pro},
  ["usb gamepad            (Vendor: 0810 Product: e501)"]: {read:snes},
};

function readGamepad(g) {
  let t = gamepads[g.id];
  let raw = readgamepad(g,t.old);
  let msg = t.read(raw);
  if(Object.keys(msg.pos).length>0) {
    t.posold = msg.pos;
  }
  else if(t.posold) {
    msg.pos.brake = true; /// speed,sensitivity filter
    Object.entries(t.posold).map(p=>msg.pos[p[0]]=-p[1]/2);
    delete t.posold;
  }
  if(Object.keys(msg.pos).length==0) delete msg.pos;  
  if(!msg.key) delete msg.key;
  return msg;
}

function startGamepad() {
  const updateInterval = 50;
  let update = _ => {
    if(typeof(navigator.getGamepads)!="function") return plog(typeof(navigator.getGamepads));
    let gg = navigator.getGamepads(); // scan all regardless connect/disconnect
    for(let n=0;n<gg.length;n++) {
      let g = gg[n];
      if(!g) continue;
      let msg = readGamepad(g);
      if(!msg) continue;
      if(msg.key||msg.pos) wssend(msg);
    }
    setTimeout(update,updateInterval); //requestAnimationFrame(update);
  }
  if(navigator.getGamepads) {
    window.addEventListener("gamepadconnected", e=>{
      let g = e.gamepad;
      let t = gamepads[g.id];
      if(!t) t = gamepads[g.id] = {read:unknown};
      t.old = {key:[],fixpos:[]}
      let msg = readgamepad(g,t.old);
      let anykey = msg.key.reduce((v,a)=>v||a,false);
      if(anykey) t.old.fixpos = [...msg.pos]; // 0.0000152587890625
      else swal.fire({text:"Gamepad was activated by stick, position will be inaccurate"});
      plog(msg,t.old.fixpos);
      state.Gamepad = g.id + (t.read==unknown ? ", bad model" : "") + (anykey ? "" : ", !position");
      showstate();
      plog("connected",g.index,g.id,g.axes.length,g.buttons.length);
    });
    window.addEventListener("gamepaddisconnected", e=>{
      let g = e.gamepad;
      let t = gamepads[g.id];
      if(t) delete t.old; 
      state.Gamepad = "disconnected";
      showstate();
      plog("disconnected",g.index,g.id);
    });
    update();
  }  
}

