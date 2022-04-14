// unix only
const fs = require('fs');
const EventEmitter = require('events')
const v4l2camera = require("v4l2camera-pr48");

let config={model:"rotg01",name:"ROTG01 PRO 5.8G UVC RECEIVER"};

class RotCamera extends require('./drone.js').Drone {
  constructor() {
    super(config)
  }

  async detect() {
    fs.readdirSync("/dev").filter(a=>a.indexOf("video")==0).map(name=>{
      shell_exec(`udevadm info -q property -n /dev/${name}`,(status,out,err)=>{
        if(out.indexOf("ID_VENDOR_ID=18ec">0) && out.indexOf("ID_MODEL_ID=5850")>0 && out.indexOf("ID_V4L_CAPABILITIES=:capture:")>0) {
          let dev = out.split("\n").filter(a=>a.indexOf("DEVNAME=")==0).map(a=>a.replace("DEVNAME=",""))[0];
          if(dev) {
            this.dev = dev;
            this.onConnect(true);
          } 
          else if(this.isconnected) {
            this.onConnect(false);
          }
        }
      })
    });
  }

  async onConnect(isconnected) {
    await super.onConnect(isconnected);
    if(isconnected) {
      await this.videoOn();
    }
  }

  async videoOn() {
    if(!this.dev) throw new Error("videoBind");
    if(this.cam) {
      await this.videoOff();
    }
    let cam = new v4l2camera.Camera(this.dev); //plog(cam.configGet());
    let self = this;
    self.cam = cam;
    let input = app.startvideo(null);
    cam.start();
    let [n1,t1] = [0,new Date().getTime()];
    let cap = async() => {
      await new Promise(r => cam.capture(r));
      await new Promise(r => cam.capture(r));
      cam.capture(function(success){
        let frame = cam.frameRaw();
        if(frame.length>0) {
          let fps = (++n1/((new Date().getTime() - t1)/1000.)).toFixed(1);
          if((n1%100)==0) [n1,t1] = [0,new Date().getTime()];
          let ave = (frame.reduce((a,b)=>a+b,0)/frame.length).toFixed(0);
          wssend("showstate",`fps:${fps};average:${ave};frame:`+typeof_(frame))
          input.emit("jpeg",Buffer.from(frame));
        }
        if(self.cam) cap();
      });
    };
    cap();
  }

  async videoOff() {
    plog(this.dev);
    app.stopvideo();
    if(this.cam) {
      this.cam.stop();
      delete this.cam;
    }
  }
}

module.exports = {Drone:RotCamera}

