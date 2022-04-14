/*
  model: any with devis
  name: any
  ap: ap mode, ip address
  sid: not used
  hw: many drones with same ap, one drone -> hw optional
*/
let config={model:"tello-edu",name:"Tello EDU",ap:"192.168.10.1",sid:"TELLO-9F9316",hw:"34:d2:62:9f:93:16"};
module.exports = require('require-uncached')('./tello.js').initModule(config);

// sdk 20
// Емкость аккумулятора, мАч 1100,1800
// version 2.4.93.1 -> 02.05.01.17
// Bus 001 Device 045: ID 0485:5712 Nokia Monitors
// Tello 0485:5712
// Tello Serial Port  ..

/*
Красный, зеленый и желтый - чередуются, мигающий  Включение и выполнение самодиагностических тестов
Зеленый - периодически мигает дважды              Vision Positioning System активна 
Желтый - медленно мигает                          Vision Positioning System недоступен, коптер находится в режиме Attitude mode
Желтый - быстро мигает                            Потерян сигнал ДУ 
Синий - постоянный                                Зарядка завершена 
Синий - медленно мигает                           Идёт зарядка 
Синий - быстро мигает                             Ошибка зарядки 
Красный - медленно мигает                         Низкий уровень заряда
Красный - быстро мигает                           Критически низкий заряд батареи
Красный - постоянный                              Критическая ошибка 
*/

/* ap mode
34:d2:62:9f:93:16 > ff:ff:ff:ff:ff:ff Null Unnumbered, xid, Flags [Response], length 46: 01 00
        0x0000:  8101 0000 0000 0000 0000 0000 0000 0000  ................
        0x0010:  0000 0000 0000 0000 0000 0000 0000 0000  ................
        0x0020:  0000 0000 0000 0038 8ae8 ac              .......8...
*/