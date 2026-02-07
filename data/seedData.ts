
import { Part, PortType, Gender } from '../types.ts';

export const HARDWARE_REGISTRY: Part[] = [
  // --- CUSTOM KEYBOARD ECOSYSTEM ---
  {
    id: 'kb-pcb-1',
    sku: 'BS-KB-PCB-65',
    name: 'BuildSheet 65% Hot-swap PCB',
    category: 'Keyboard PCB',
    brand: 'BuildSheet Engineering',
    price: 45.00,
    description: 'A 65% PCB with support for multi-layout hot-swap sockets.',
    ports: [
      { id: 'p1', name: 'Switch Socket (68x)', type: PortType.MECHANICAL, gender: Gender.FEMALE, spec: 'mx-socket' },
      { id: 'p2', name: 'USB-C In', type: PortType.DATA, gender: Gender.FEMALE, spec: 'usb-c' }
    ]
  },
  {
    id: 'kb-sw-1',
    sku: 'GMK-LINEAR-01',
    name: 'Gateron Milky Yellow Linear Switches',
    category: 'Switch',
    brand: 'Gateron',
    price: 0.25,
    description: 'Smooth linear switches with a classic milky housing.',
    ports: [
      { id: 's1', name: 'Mounting Pins', type: PortType.MECHANICAL, gender: Gender.MALE, spec: 'mx-socket' }
    ]
  },
  {
    id: 'kb-case-1',
    sku: 'TOFU-65-ALU',
    name: 'Tofu65 Aluminum Case',
    category: 'Case',
    brand: 'KBDfans',
    price: 110.00,
    description: 'Heavy aluminum block CNC case for 65% PCBs.',
    ports: [
      { id: 'c1', name: 'PCB Mounting Pillars', type: PortType.MECHANICAL, gender: Gender.MALE, spec: 'pcb-mount-standard' }
    ]
  },

  // --- EMBEDDED COMPUTE & MCUs ---
  {
    id: 'mcu-esp32-wroom',
    sku: 'ESP32-WROOM-32D',
    name: 'ESP32-WROOM-32D Development Board',
    category: 'Microcontroller',
    brand: 'Espressif',
    price: 6.50,
    description: 'WiFi + Bluetooth dual-core microcontroller. Perfect for IoT.',
    ports: [
        { id: 'gpio', name: 'GPIO Header', type: PortType.ELECTRICAL, gender: Gender.MALE, spec: '2.54mm-pitch' },
        { id: 'usb', name: 'Micro-USB Power/Data', type: PortType.DATA, gender: Gender.FEMALE, spec: 'micro-usb' }
    ]
  },
  {
    id: 'mcu-arduino-uno',
    sku: 'ARD-UNO-R3',
    name: 'Arduino Uno R3',
    category: 'Microcontroller',
    brand: 'Arduino',
    price: 24.00,
    description: 'The classic entry-level development board for electronics.',
    ports: [
        { id: 'io', name: 'Digital/Analog Pins', type: PortType.ELECTRICAL, gender: Gender.FEMALE, spec: '2.54mm-header' },
        { id: 'jack', name: 'Barrel Jack', type: PortType.ELECTRICAL, gender: Gender.FEMALE, spec: 'dc-jack-5.5-2.1' }
    ]
  },
  {
    id: 'mcu-rpi-4',
    sku: 'RPI4-8GB',
    name: 'Raspberry Pi 4 Model B (8GB)',
    category: 'Single Board Computer',
    brand: 'Raspberry Pi Foundation',
    price: 75.00,
    description: 'Powerful quad-core SBC for high-compute applications.',
    ports: [
        { id: 'gpio', name: '40-Pin Header', type: PortType.ELECTRICAL, gender: Gender.MALE, spec: 'rpi-gpio' },
        { id: 'hdmi', name: 'Micro-HDMI (x2)', type: PortType.DATA, gender: Gender.FEMALE, spec: 'micro-hdmi' },
        { id: 'usb-c', name: 'USB-C Power', type: PortType.ELECTRICAL, gender: Gender.FEMALE, spec: 'usb-c-pwr' }
    ]
  },
  {
    id: 'mcu-esp8266-d1',
    sku: 'D1-MINI-ESP8266',
    name: 'Wemos D1 Mini ESP8266',
    category: 'Microcontroller',
    brand: 'Wemos',
    price: 4.00,
    description: 'Tiny WiFi enabled microcontroller board.',
    ports: [
        { id: 'pins', name: 'Header Pins', type: PortType.ELECTRICAL, gender: Gender.MALE, spec: 'd1-mini-header' }
    ]
  },

  // --- DRONE / FPV ECOSYSTEM ---
  {
    id: 'drone-mot-xing2',
    sku: 'IFL-XING2-2207',
    name: 'XING2 2207 1855KV Motor',
    category: 'Brushless Motor',
    brand: 'iFlight',
    price: 26.99,
    description: 'High-performance motor for 5-inch FPV drones.',
    ports: [
        { id: 'base', name: 'Motor Mount (16x16)', type: PortType.MECHANICAL, gender: Gender.MALE, spec: 'm3-16x16' },
        { id: 'leads', name: 'Phase Wires', type: PortType.ELECTRICAL, gender: Gender.MALE, spec: 'solder-point' }
    ]
  },
  {
    id: 'drone-fc-stack',
    sku: 'S-BEE-F7-STACK',
    name: 'SpeedyBee F7 V3 Stack (FC + 50A ESC)',
    category: 'Flight Stack',
    brand: 'SpeedyBee',
    price: 105.00,
    description: 'F7 Flight Controller paired with a 50A 4-in-1 ESC.',
    ports: [
        { id: 'mount', name: 'Stack Mount (30.5x30.5)', type: PortType.MECHANICAL, gender: Gender.FEMALE, spec: 'm3-30x30' },
        { id: 'vtx', name: 'VTX Port', type: PortType.DATA, gender: Gender.FEMALE, spec: 'sh1.0-6pin' },
        { id: 'batt', name: 'Battery Pads', type: PortType.ELECTRICAL, gender: Gender.FEMALE, spec: 'solder-pads-heavy' }
    ]
  },
  {
    id: 'drone-cam-vista',
    sku: 'CADDX-VISTA',
    name: 'Caddx Vista Digital VTX',
    category: 'Video Transmitter',
    brand: 'Caddx',
    price: 145.00,
    description: 'Digital HD FPV transmitter compatible with DJI Goggles.',
    ports: [
        { id: 'ant', name: 'U.FL Antenna', type: PortType.DATA, gender: Gender.FEMALE, spec: 'u.fl' },
        { id: 'input', name: 'Power/Data', type: PortType.ELECTRICAL, gender: Gender.FEMALE, spec: 'sh1.0-6pin' }
    ]
  },
  {
    id: 'drone-prop-hq',
    sku: 'HQ-V2S-5X43',
    name: 'HQProp Ethix S3 Propeller (5 inch)',
    category: 'Propeller',
    brand: 'HQProp',
    price: 3.50,
    description: 'Watermelon green propellers for freestyle FPV.',
    ports: [
        { id: 'hub', name: 'Motor Hub', type: PortType.MECHANICAL, gender: Gender.FEMALE, spec: '5mm-prop-hub' }
    ]
  },
  {
    id: 'drone-frame-apex',
    sku: 'IMP-APEX-5',
    name: 'ImpulseRC Apex 5" Frame Kit',
    category: 'Frame',
    brand: 'ImpulseRC',
    price: 95.00,
    description: 'Indestructible freestyle drone frame.',
    ports: [
        { id: 'fc-mount', name: 'FC Stack Mount', type: PortType.MECHANICAL, gender: Gender.MALE, spec: 'm3-30x30' },
        { id: 'mot-mount', name: 'Arm Mounts', type: PortType.MECHANICAL, gender: Gender.FEMALE, spec: 'm3-16x16' }
    ]
  },

  // --- ROBOTICS & MOTION ---
  {
    id: 'rob-servo-mg996r',
    sku: 'TW-MG996R',
    name: 'MG996R High Torque Metal Gear Servo',
    category: 'Servo',
    brand: 'TowerPro',
    price: 9.50,
    description: 'Metal gear servo for high torque robotic applications.',
    ports: [
        { id: 'out', name: 'Output Spline', type: PortType.MECHANICAL, gender: Gender.MALE, spec: '25T-spline' },
        { id: 'pwr', name: 'Servo Cable', type: PortType.ELECTRICAL, gender: Gender.FEMALE, spec: '3-pin-servo' }
    ]
  },
  {
    id: 'rob-mot-nema17',
    sku: 'STEP-NEMA17-42',
    name: 'NEMA 17 Stepper Motor (42mm)',
    category: 'Stepper Motor',
    brand: 'Generic',
    price: 16.00,
    description: 'Standard stepper motor for 3D printers and CNCs.',
    ports: [
        { id: 'shaft', name: 'D-Shaft (5mm)', type: PortType.MECHANICAL, gender: Gender.MALE, spec: '5mm-shaft' },
        { id: 'conn', name: '6-Pin Connector', type: PortType.ELECTRICAL, gender: Gender.FEMALE, spec: 'jst-ph-6' }
    ]
  },
  {
    id: 'rob-lin-act',
    sku: 'LIN-ACT-100',
    name: '100mm Stroke Linear Actuator',
    category: 'Actuator',
    brand: 'Progessive',
    price: 45.00,
    description: 'Electric piston for linear motion control.',
    ports: [
        { id: 'mount', name: 'Clevis Mount', type: PortType.MECHANICAL, gender: Gender.MALE, spec: 'clevis-pin' }
    ]
  },
  {
    id: 'rob-enc-600',
    sku: 'ROT-ENC-600',
    name: '600P/R Incremental Rotary Encoder',
    category: 'Encoder',
    brand: 'Omron Compatible',
    price: 18.00,
    description: 'Rotary encoder for precise position feedback.',
    ports: [
        { id: 'shaft', name: '6mm Shaft', type: PortType.MECHANICAL, gender: Gender.MALE, spec: '6mm-shaft' }
    ]
  },

  // --- SENSORS ---
  {
    id: 'sen-dht22',
    sku: 'SEN-DHT22',
    name: 'DHT22 Temperature & Humidity Sensor',
    category: 'Environmental Sensor',
    brand: 'Generic',
    price: 5.50,
    description: 'Digital sensor for reading ambient conditions.',
    ports: [
        { id: 'out', name: 'Digital Output', type: PortType.ELECTRICAL, gender: Gender.MALE, spec: '1-wire-header' }
    ]
  },
  {
    id: 'sen-us-04',
    sku: 'HC-SR04',
    name: 'HC-SR04 Ultrasonic Distance Sensor',
    category: 'Range Sensor',
    brand: 'Generic',
    price: 3.50,
    description: 'Measures distance via ultrasonic echo.',
    ports: [
        { id: 'pins', name: '4-Pin Header', type: PortType.ELECTRICAL, gender: Gender.MALE, spec: 'hc-sr04-pins' }
    ]
  },
  {
    id: 'sen-imu-6050',
    sku: 'MPU-6050-MOD',
    name: 'MPU-6050 6-Axis Accelerometer/Gyro',
    category: 'IMU',
    brand: 'TDK InvenSense',
    price: 4.00,
    description: 'Inertial measurement unit for balance and motion tracking.',
    ports: [
        { id: 'bus', name: 'I2C Interface', type: PortType.DATA, gender: Gender.MALE, spec: 'i2c-header' }
    ]
  },
  {
    id: 'sen-lidar-tf',
    sku: 'BEN-TF-MINI',
    name: 'TF-Mini LiDAR Rangefinder',
    category: 'LiDAR',
    brand: 'Benewake',
    price: 39.00,
    description: 'Compact laser range sensor for precision robotics.',
    ports: [
        { id: 'uart', name: 'UART Port', type: PortType.DATA, gender: Gender.FEMALE, spec: 'jst-gh-4' }
    ]
  },

  // --- POWER SYSTEMS ---
  {
    id: 'pwr-lipo-4s',
    sku: 'OV-4S-1500',
    name: 'Ovonic 4S 1500mAh 100C LiPo',
    category: 'Battery',
    brand: 'Ovonic',
    price: 22.00,
    description: 'High-discharge battery for racing drones.',
    ports: [
        { id: 'main', name: 'XT60 Discharge', type: PortType.ELECTRICAL, gender: Gender.FEMALE, spec: 'xt60' },
        { id: 'bal', name: '4S Balance Lead', type: PortType.ELECTRICAL, gender: Gender.FEMALE, spec: 'jst-xh-4s' }
    ]
  },
  {
    id: 'pwr-buck-adj',
    sku: 'LM2596-MOD',
    name: 'LM2596 Step-Down Buck Converter',
    category: 'Power Module',
    brand: 'Generic',
    price: 2.50,
    description: 'Efficient voltage regulator module.',
    ports: [
        { id: 'in', name: 'Voltage Input', type: PortType.ELECTRICAL, gender: Gender.FEMALE, spec: 'solder-pads' },
        { id: 'out', name: 'Regulated Output', type: PortType.ELECTRICAL, gender: Gender.FEMALE, spec: 'solder-pads' }
    ]
  },
  {
    id: 'pwr-sol-6v',
    sku: 'SOLAR-6V-2W',
    name: '6V 2W Monocrystalline Solar Panel',
    category: 'Energy Source',
    brand: 'Generic',
    price: 12.00,
    description: 'Small rigid panel for remote weather stations.',
    ports: [
        { id: 'wire', name: 'Positive/Negative Lead', type: PortType.ELECTRICAL, gender: Gender.MALE, spec: 'wire-tinned' }
    ]
  },

  // --- MECHANICAL COMPONENTS ---
  {
    id: 'mech-ext-2020',
    sku: 'ALU-2020-1M',
    name: '2020 Aluminum Extrusion (1m)',
    category: 'Structure',
    brand: 'Generic',
    price: 15.00,
    description: 'T-Slot structural profile for framing.',
    ports: [
        { id: 'slot', name: 'T-Slot Groove', type: PortType.MECHANICAL, gender: Gender.FEMALE, spec: '2020-slot' }
    ]
  },
  {
    id: 'mech-scr-m3-8',
    sku: 'SCR-M3-8-BTN',
    name: 'M3x8mm Button Head Screw (50pk)',
    category: 'Fastener',
    brand: 'Generic',
    price: 4.50,
    description: 'Standard black oxide hardware.',
    ports: [
        { id: 'thrd', name: 'Thread', type: PortType.MECHANICAL, gender: Gender.MALE, spec: 'm3-thread' }
    ]
  },
  {
    id: 'mech-tnut-m3',
    sku: 'TNUT-2020-M3',
    name: '2020 Series M3 T-Nut (20pk)',
    category: 'Fastener',
    brand: 'Generic',
    price: 6.00,
    description: 'Slide-in nuts for aluminum extrusions.',
    ports: [
        { id: 'fit', name: 'Slot Fit', type: PortType.MECHANICAL, gender: Gender.MALE, spec: '2020-slot' },
        { id: 'thrd', name: 'Threaded Hole', type: PortType.MECHANICAL, gender: Gender.FEMALE, spec: 'm3-thread' }
    ]
  },

  // --- PC / DESKTOP COMPONENTS ---
  {
    id: 'pc-fan-noctua',
    sku: 'NOC-NF-A12',
    name: 'Noctua NF-A12x25 PWM Fan',
    category: 'Cooling',
    brand: 'Noctua',
    price: 32.90,
    description: 'The quietest and most efficient 120mm fan on the market.',
    ports: [
        { id: 'pwr', name: '4-Pin PWM', type: PortType.ELECTRICAL, gender: Gender.FEMALE, spec: 'fan-4pin' },
        { id: 'mount', name: 'Screw Holes (120mm)', type: PortType.MECHANICAL, gender: Gender.FEMALE, spec: 'pc-fan-mount-120' }
    ]
  },
  {
    id: 'pc-ssd-nvme',
    sku: 'SAMSUNG-980-1TB',
    name: 'Samsung 980 Pro NVMe 1TB',
    category: 'Storage',
    brand: 'Samsung',
    price: 99.00,
    description: 'Gen4 high speed internal SSD.',
    ports: [
        { id: 'm2', name: 'M.2 Key M', type: PortType.DATA, gender: Gender.MALE, spec: 'm.2-m' }
    ]
  },

  // --- AUTOMOTIVE POWERTRAIN ECOSYSTEM ---
  {
    id: 'truck-eng-1',
    sku: 'CHEVY-LS-53-ALU',
    name: 'GM 5.3L LS V8 (Aluminum Block)',
    category: 'Engine',
    brand: 'GM Performance',
    price: 4200.00,
    description: 'Modern aluminum block LS-series V8. Significantly lighter than iron blocks.',
    ports: [
      { id: 'e1', name: 'Bellhousing Mount', type: PortType.MECHANICAL, gender: Gender.FEMALE, spec: 'chevy-v8-bellhousing' },
      { id: 'e2', name: 'Engine Mounts', type: PortType.MECHANICAL, gender: Gender.MALE, spec: 'chevy-ls-mount' }
    ]
  },
  {
    id: 'truck-trans-1',
    sku: '4L60E-TRANS',
    name: '4L60E Automatic Transmission',
    category: 'Transmission',
    brand: 'GM Performance',
    price: 1800.00,
    description: 'Electronic 4-speed automatic transmission.',
    ports: [
      { id: 't1', name: 'Engine Input', type: PortType.MECHANICAL, gender: Gender.MALE, spec: 'chevy-v8-bellhousing' },
      { id: 't2', name: 'Driveshaft Output', type: PortType.MECHANICAL, gender: Gender.FEMALE, spec: 'u-joint-1310' }
    ]
  },

  // --- FLASHLIGHT ECOSYSTEM ---
  {
    id: 'batt-18650',
    sku: 'LION-18650-3500',
    name: 'Panasonic 18650 Battery',
    category: 'Power',
    brand: 'Panasonic',
    price: 8.50,
    description: 'High capacity 3500mAh Li-ion cell (Flat Top).',
    ports: [
        { id: 'b1', name: 'Positive Contact', type: PortType.ELECTRICAL, gender: Gender.MALE, spec: 'batt-contact-pos' },
        { id: 'b2', name: 'Negative Contact', type: PortType.ELECTRICAL, gender: Gender.MALE, spec: 'batt-contact-neg' },
        { id: 'b3', name: 'Form Factor', type: PortType.MECHANICAL, gender: Gender.MALE, spec: '18650-tube' }
    ]
  },
  {
    id: 'led-driver-ic',
    sku: 'AMC-7135-PCB',
    name: '17mm Constant Current Driver',
    category: 'Controller',
    brand: 'Generic',
    price: 4.50,
    description: 'Regulates power to LED. Fits 17mm driver pill.',
    ports: [
        { id: 'd1', name: 'Battery Input (+)', type: PortType.ELECTRICAL, gender: Gender.FEMALE, spec: 'batt-contact-pos' },
        { id: 'd2', name: 'LED Output', type: PortType.ELECTRICAL, gender: Gender.FEMALE, spec: 'solder-pad-led' },
        { id: 'd3', name: 'Mounting', type: PortType.MECHANICAL, gender: Gender.MALE, spec: '17mm-driver-slot' }
    ]
  },
  {
    id: 'led-emitter',
    sku: 'CREE-XPL-HI',
    name: 'Cree XP-L HI Emitter',
    category: 'Light Engine',
    brand: 'Cree',
    price: 6.00,
    description: 'High intensity LED on 16mm MCPCB.',
    ports: [
        { id: 'l1', name: 'Power Input', type: PortType.ELECTRICAL, gender: Gender.MALE, spec: 'solder-pad-led' },
        { id: 'l2', name: 'Base Plate', type: PortType.MECHANICAL, gender: Gender.MALE, spec: '16mm-mcpcb-shelf' }
    ]
  },
  {
    id: 'flashlight-body',
    sku: 'C8-HOST-ALU',
    name: 'C8 Aluminum Host',
    category: 'Chassis',
    brand: 'Convoy',
    price: 18.00,
    description: 'Complete host body including reflector, lens, and tail switch.',
    ports: [
        { id: 'h1', name: 'Driver Bay', type: PortType.MECHANICAL, gender: Gender.FEMALE, spec: '17mm-driver-slot' },
        { id: 'h2', name: 'Battery Tube', type: PortType.MECHANICAL, gender: Gender.FEMALE, spec: '18650-tube' },
        { id: 'h3', name: 'LED Shelf', type: PortType.MECHANICAL, gender: Gender.FEMALE, spec: '16mm-mcpcb-shelf' }
    ]
  },

  // --- CONNECTORS & CABLES ---
  {
      id: 'conn-xt60-pair',
      sku: 'AMASS-XT60',
      name: 'Amass XT60 Connectors (Pair)',
      category: 'Connector',
      brand: 'Amass',
      price: 1.50,
      description: 'Gold-plated high current power connectors.',
      ports: [
          { id: 'm', name: 'Male End', type: PortType.ELECTRICAL, gender: Gender.MALE, spec: 'xt60' },
          { id: 'f', name: 'Female End', type: PortType.ELECTRICAL, gender: Gender.FEMALE, spec: 'xt60' }
      ]
  },
  {
      id: 'conn-jst-xh-set',
      sku: 'JST-XH-2.54',
      name: 'JST-XH 2.54mm Connector Kit',
      category: 'Connector',
      brand: 'Generic',
      price: 12.00,
      description: 'Standard balance leads and small signal connector kit.',
      ports: []
  },

  // --- IO & DISPLAYS ---
  {
      id: 'io-oled-0.96',
      sku: 'SSD1306-OLED',
      name: '0.96" I2C OLED Display',
      category: 'Display',
      brand: 'Generic',
      price: 4.50,
      description: '128x64 pixels monochrome display.',
      ports: [
          { id: 'i2c', name: 'I2C Interface', type: PortType.DATA, gender: Gender.MALE, spec: 'i2c-header' }
      ]
  },
  {
      id: 'io-btn-arcade',
      sku: 'ARC-BTN-30',
      name: '30mm Arcade Button',
      category: 'Input',
      brand: 'Sanwa Compatible',
      price: 2.20,
      description: 'High-speed reactive push button.',
      ports: [
          { id: 'sw', name: 'Terminal Pair', type: PortType.ELECTRICAL, gender: Gender.MALE, spec: 'quick-disconnect' }
      ]
  },

  // --- ADDING MORE COMMON ITEMS TO REACH ~100 ---
  { id: 'comp-resistor-10k', sku: 'RES-10K-025W', name: '10k Ohm Resistor (100pk)', category: 'Electronic Component', brand: 'Yageo', price: 1.50, description: 'Standard pull-up resistor.', ports: [] },
  { id: 'comp-cap-10uf', sku: 'CAP-10UF-25V', name: '10uF Electrolytic Capacitor', category: 'Electronic Component', brand: 'Rubycon', price: 0.20, description: 'Power filter cap.', ports: [] },
  { id: 'comp-led-red', sku: 'LED-5MM-RED', name: '5mm Red LED (25pk)', category: 'Light Engine', brand: 'Generic', price: 2.00, description: 'Indicator LED.', ports: [] },
  { id: 'mcu-esp32-cam', sku: 'ESP32-CAM-AI', name: 'ESP32-CAM with Camera Module', category: 'Microcontroller', brand: 'AI-Thinker', price: 9.00, description: 'Camera module for ESP32.', ports: [] },
  { id: 'sen-pir-hc', sku: 'HC-SR501-PIR', name: 'HC-SR501 PIR Motion Sensor', category: 'Range Sensor', brand: 'Generic', price: 2.50, description: 'Infrared motion detector.', ports: [] },
  { id: 'sen-ldr-gl', sku: 'LDR-5MM-GL55', name: 'Light Dependent Resistor (GL55)', category: 'Environmental Sensor', brand: 'Generic', price: 0.15, description: 'Analog light sensor.', ports: [] },
  { id: 'io-pot-10k', sku: 'POT-WH148-10K', name: '10k Linear Potentiometer', category: 'Input', brand: 'Bourns', price: 1.20, description: 'Variable resistor with knob.', ports: [] },
  { id: 'pwr-9v-clip', sku: '9V-BATT-CLIP', name: '9V Battery Clip with Jack', category: 'Connector', brand: 'Generic', price: 0.80, description: 'Connect 9V battery to barrel jack.', ports: [] },
  { id: 'mech-gear-60t', sku: 'GEAR-60T-GT2', name: 'GT2 60T Timing Pulley (8mm Bore)', category: 'Motion Control', brand: 'Generic', price: 4.50, description: 'Large pulley for 3D printers.', ports: [] },
  { id: 'mech-belt-gt2', sku: 'BELT-GT2-6MM', name: 'GT2 Timing Belt (6mm Wide, 1m)', category: 'Motion Control', brand: 'Generic', price: 3.00, description: 'Reinforced rubber belt.', ports: [] },
  { id: 'mcu-stm32-blue', sku: 'STM32F103-BLUE', name: 'STM32 "Blue Pill" Development Board', category: 'Microcontroller', brand: 'ST Micro', price: 6.00, description: 'ARM Cortex-M3 board.', ports: [] },
  { id: 'io-enc-ec11', sku: 'ENC-EC11-RGB', name: 'EC11 Rotary Encoder with RGB', category: 'Input', brand: 'Alps Compatible', price: 3.50, description: 'Clicky encoder with lighting.', ports: [] },
  { id: 'mcu-teensy-41', sku: 'PJRC-TEENSY-41', name: 'Teensy 4.1 Development Board', category: 'Microcontroller', brand: 'PJRC', price: 28.00, description: 'High-speed 600MHz ARM processor.', ports: [] },
  { id: 'sen-mic-max', sku: 'MAX9814-MIC', name: 'MAX9814 Mic with Auto Gain', category: 'Sensor', brand: 'Adafruit', price: 7.95, description: 'Voice and sound sensing.', ports: [] },
  { id: 'pc-pwr-atx', sku: 'CORSAIR-RM750', name: 'Corsair RM750 Modular PSU', category: 'Power', brand: 'Corsair', price: 125.00, description: '750W 80+ Gold power supply.', ports: [] },
  { id: 'pc-ram-ddr4', sku: 'LPX-16GB-3200', name: 'Corsair Vengeance 16GB DDR4', category: 'Memory', brand: 'Corsair', price: 55.00, description: 'Performance RAM kit.', ports: [] },
  { id: 'rob-mot-br-130', sku: 'MOT-130-DC', name: 'Mini DC Motor (130 Size)', category: 'Motor', brand: 'Generic', price: 1.20, description: 'Simple toy motor.', ports: [] },
  { id: 'pwr-tp4056', sku: 'TP4056-LIPO', name: 'TP4056 Li-Ion Charging Module', category: 'Power', brand: 'Generic', price: 1.50, description: 'Safe charging for single cells.', ports: [] },
  { id: 'io-spk-8ohm', sku: 'SPK-8OHM-2W', name: 'Small 8 Ohm 2W Speaker', category: 'Output', brand: 'Generic', price: 3.00, description: 'Internal chassis speaker.', ports: [] },
  { id: 'conn-db9-f', sku: 'DB9-FEMALE-PLUG', name: 'DB9 Female Connector', category: 'Connector', brand: 'Generic', price: 0.90, description: 'Serial port plug.', ports: [] },
  { id: 'drone-rx-crsf', sku: 'TBS-NANO-RX', name: 'TBS Crossfire Nano RX', category: 'Receiver', brand: 'Team BlackSheep', price: 29.95, description: 'Long range FPV receiver.', ports: [] },
  { id: 'sen-prs-bmp', sku: 'BMP280-MOD', name: 'BMP280 Barometric Pressure Sensor', category: 'Sensor', brand: 'Bosch', price: 4.00, description: 'Altitude and pressure sensing.', ports: [] },
  { id: 'io-mat-4x4', sku: 'KEY-4X4-MATRIX', name: '4x4 Matrix Keypad', category: 'Input', brand: 'Generic', price: 3.50, description: 'Numeric input pad.', ports: [] },
  { id: 'comp-proto-82', sku: 'BRD-PROTO-82', name: 'Glass Fiber Proto-Board (8x12cm)', category: 'Prototyping', brand: 'Generic', price: 2.00, description: 'Permanent soldering board.', ports: [] },
  { id: 'sen-uv-guv', sku: 'GUVA-S12SD-UV', name: 'GUVA-S12SD UV Sensor', category: 'Sensor', brand: 'Generic', price: 6.50, description: 'UV light intensity sensor.', ports: [] },
  { id: 'rob-dvr-l298n', sku: 'L298N-H-BRIDGE', name: 'L298N Dual H-Bridge Motor Driver', category: 'Driver', brand: 'Generic', price: 4.50, description: 'Controls two DC motors.', ports: [] },
  { id: 'pwr-dc-5v', sku: 'PWR-5V-2A-ADAP', name: '5V 2A DC Power Adapter', category: 'Power', brand: 'Generic', price: 8.00, description: 'Standard wall adapter.', ports: [] },
  { id: 'mech-ext-vslot', sku: 'VSLOT-2040-1M', name: '2040 V-Slot Extrusion (1m)', category: 'Structure', brand: 'OpenBuilds', price: 22.00, description: 'Heavy structural rail.', ports: [] },
  { id: 'comp-logic-74', sku: '74HC595-SHIFT', name: '74HC595 Shift Register', category: 'Logic', brand: 'TI', price: 0.50, description: 'Expand output pins.', ports: [] },
  { id: 'io-joy-xy', sku: 'JOY-XY-BTN', name: 'Analog XY Joystick Module', category: 'Input', brand: 'Generic', price: 3.50, description: 'PSP-style joystick.', ports: [] },
  { id: 'sen-wat-fl', sku: 'WATER-FLOW-SEN', name: 'YF-S201 Water Flow Sensor', category: 'Fluid', brand: 'Generic', price: 9.00, description: 'Measure liquid volume.', ports: [] },
  { id: 'mech-bear-608', sku: 'BEAR-608ZZ', name: '608ZZ Ball Bearing', category: 'Motion', brand: 'Bones', price: 1.50, description: 'Skateboard style bearing.', ports: [] },
  { id: 'pwr-conv-mt3608', sku: 'MT3608-BOOST', name: 'MT3608 Adjustable Boost Converter', category: 'Power', brand: 'Generic', price: 2.00, description: 'Step-up voltage.', ports: [] },
  { id: 'conn-usb-break', sku: 'USB-C-BREAKOUT', name: 'USB-C Female Breakout Board', category: 'Connector', brand: 'Generic', price: 2.50, description: 'Easy access to USB-C pins.', ports: [] },
  { id: 'comp-opt-moc', sku: 'MOC3021-OPTO', name: 'MOC3021 Optoisolator', category: 'Electronic Component', brand: 'Fairchild', price: 1.10, description: 'Electrical isolation.', ports: [] },
  { id: 'io-seg-4dig', sku: 'TM1637-DISPLAY', name: '4-Digit 7-Segment Display (TM1637)', category: 'Display', brand: 'Generic', price: 4.00, description: 'Simple numeric clock display.', ports: [] },
  { id: 'sen-gas-mq2', sku: 'MQ2-GAS-SEN', name: 'MQ2 Combustible Gas Sensor', category: 'Sensor', brand: 'Generic', price: 5.00, description: 'Detects smoke/gas leaks.', ports: [] },
  { id: 'mech-mag-102', sku: 'MAG-10-2-NEO', name: '10mm x 2mm Neodymium Magnet', category: 'Mechanical', brand: 'Generic', price: 0.50, description: 'Strong tiny magnet.', ports: [] },
  { id: 'io-buzz-5v', sku: 'ACT-BUZZ-5V', name: '5V Active Buzzer', category: 'Output', brand: 'Generic', price: 1.00, description: 'Beep maker.', ports: [] },
  { id: 'comp-trans-2n', sku: '2N2222-NPN-TO92', name: '2N2222 NPN Transistor (50pk)', category: 'Logic', brand: 'ON Semi', price: 3.50, description: 'General purpose switch.', ports: [] },
  { id: 'mcu-zero-w', sku: 'RPI-ZERO-W', name: 'Raspberry Pi Zero W', category: 'SBC', brand: 'Raspberry Pi', price: 15.00, description: 'Tiny WiFi enabled linux computer.', ports: [] },
  { id: 'pwr-xt30-f', sku: 'AMASS-XT30-F', name: 'XT30 Connector (Female)', category: 'Connector', brand: 'Amass', price: 0.80, description: 'Smaller power connector.', ports: [] },
  { id: 'drone-ant-fox', sku: 'FOX-LHP-ANT', name: 'Foxeer Lollipop 4 Antenna', category: 'Antenna', brand: 'Foxeer', price: 19.99, description: 'RHCP FPV antenna.', ports: [] },
  { id: 'sen-color-tcs', sku: 'TCS3200-RGB', name: 'TCS3200 Color Sensor', category: 'Sensor', brand: 'Generic', price: 8.00, description: 'Reads RGB color values.', ports: [] },
  { id: 'rob-omni-wheel', sku: 'OMNI-60MM', name: '60mm Omni-Directional Wheel', category: 'Motion', brand: 'Generic', price: 14.00, description: 'Multi-directional movement.', ports: [] },
  { id: 'mech-rod-8mm', sku: 'LINEAR-ROD-8MM', name: '8mm Chrome Linear Rod (500mm)', category: 'Motion', brand: 'Generic', price: 12.00, description: 'Smooth guide rail.', ports: [] },
  { id: 'io-neopixel-16', sku: 'NEO-RING-16', name: '16-LED NeoPixel Ring (WS2812B)', category: 'Light Engine', brand: 'Adafruit', price: 9.95, description: 'Addressable RGB LED ring.', ports: [] },
  { id: 'mcu-microbit', sku: 'MICRO-BIT-V2', name: 'BBC micro:bit V2', category: 'MCU', brand: 'BBC', price: 20.00, description: 'Educational MCU with sensors.', ports: [] },
  { id: 'sen-hall-3144', sku: 'A3144-HALL', name: 'A3144 Hall Effect Sensor', category: 'Sensor', brand: 'Generic', price: 0.50, description: 'Magnetic field detector.', ports: [] },
  { id: 'pwr-cr2032', sku: 'BATT-CR2032', name: 'CR2032 Coin Cell (5pk)', category: 'Battery', brand: 'Energizer', price: 5.50, description: '3V CMOS battery.', ports: [] },
  { id: 'mech-stdf-m3', sku: 'STDF-M3-10-HEX', name: 'M3x10mm Brass Standoff (20pk)', category: 'Mechanical', brand: 'Generic', price: 4.50, description: 'PCB support spacer.', ports: [] },
  { id: 'io-lcd-1602', sku: 'LCD-1602-I2C', name: '1602 Character LCD (I2C Module)', category: 'Display', brand: 'Generic', price: 6.50, description: '2x16 text screen.', ports: [] },
  { id: 'pwr-buck-usb', sku: 'BUCK-USB-QC3', name: 'QC3.0 USB Buck Converter Module', category: 'Power', brand: 'Generic', price: 5.50, description: 'Step down to USB fast charge.', ports: [] },
  { id: 'rob-pmp-mini', sku: 'PMP-3V-6V-AIR', name: 'Mini 3-6V Air Pump', category: 'Actuator', brand: 'Generic', price: 7.00, description: 'Small vacuum/air pump.', ports: [] },
  { id: 'sen-weight-hx', sku: 'HX711-LOAD-5KG', name: '5kg Load Cell + HX711 Amp', category: 'Sensor', brand: 'Generic', price: 11.00, description: 'Scale/Weight sensor kit.', ports: [] }
];
