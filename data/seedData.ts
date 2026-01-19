
import { Part, PortType, Gender } from '../types';

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

  // --- 1994 CHEVY TRUCK ECOSYSTEM ---
  {
    id: 'truck-eng-1',
    sku: 'CHEVY-V8-350',
    name: 'GM 5.7L 350 Small Block V8',
    category: 'Engine',
    brand: 'GM Performance',
    price: 3500.00,
    description: 'The legendary small block 350. Reliable, powerful, iconic.',
    ports: [
      { id: 'e1', name: 'Bellhousing Mount', type: PortType.MECHANICAL, gender: Gender.FEMALE, spec: 'chevy-v8-bellhousing' },
      { id: 'e2', name: 'Engine Mounts', type: PortType.MECHANICAL, gender: Gender.MALE, spec: 'chevy-truck-mount' }
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
  }
];
