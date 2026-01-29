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

  // --- AUTOMOTIVE POWERTRAIN ECOSYSTEM ---
  {
    id: 'truck-eng-1',
    sku: 'CHEVY-LS-53-ALU',
    name: 'GM 5.3L LS V8 (Aluminum Block)',
    category: 'Engine',
    brand: 'GM Performance',
    price: 4200.00,
    description: 'Modern aluminum block LS-series V8. Significantly lighter than iron blocks with superior airflow.',
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
  }
];