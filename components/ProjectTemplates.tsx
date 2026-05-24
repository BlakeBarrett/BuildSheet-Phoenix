import React from 'react';
import { useTranslation } from 'react-i18next';
import { Button, IconButton } from './Material3UI.tsx';

export interface ProjectTemplate {
  id: string;
  name: string;
  icon: string;
  description: string;
  requirements: string;
}

export const PROJECT_TEMPLATES: ProjectTemplate[] = [
  {
    id: 'engine-rebuild',
    name: 'Engine Rebuild',
    icon: 'precision_manufacturing',
    description: 'Complete engine teardown and rebuild with gaskets, bearings, and timing components.',
    requirements: 'Complete engine rebuild — include all gaskets, seals, bearings, piston rings, timing chain/belt kit, oil pump, and water pump. Assume a full machining job with fresh internals.',
  },
  {
    id: 'custom-exhaust',
    name: 'Custom Exhaust System',
    icon: 'air',
    description: 'Headers, pipes, catalytic converter, muffler, and mounting hardware.',
    requirements: 'Custom exhaust system build — include headers or manifolds, intermediate pipes, catalytic converter, muffler/resonator, exhaust tips, hangers, clamps, and gaskets.',
  },
  {
    id: 'electrical-harness',
    name: 'Electrical Harness',
    icon: 'cable',
    description: 'Wire harness, connectors, relays, fuses, and ECU integration.',
    requirements: 'Custom electrical wiring harness — include main harness, engine sub-harness, connectors (Deutsch/Metripack), relays, fuse box, wire loom, heat shrink, and terminal crimps. Specify gauge for each circuit.',
  },
  {
    id: 'iot-sensor-hub',
    name: 'IoT Sensor Hub',
    icon: 'sensors',
    description: 'Microcontroller, sensors, wireless radio, and power management.',
    requirements: 'IoT sensor hub — include a microcontroller (ESP32 or similar), temperature/humidity/pressure sensors, LoRa or WiFi radio module, battery management IC, LiPo battery, custom PCB, and 3D-printed enclosure.',
  },
  {
    id: 'robotics-arm',
    name: 'Robotic Arm Kit',
    icon: 'smart_toy',
    description: 'Servo motors, joints, controller, and structural frame.',
    requirements: 'Desktop robotic arm — include 6 servo motors (MG996R or similar), aluminum brackets and joints, Arduino or similar controller, power supply, wiring harness, and gripper end-effector.',
  },
];

interface ProjectTemplatePickerProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (template: ProjectTemplate) => void;
}

export const ProjectTemplatePicker: React.FC<ProjectTemplatePickerProps> = ({ isOpen, onClose, onSelect }) => {
  const { t } = useTranslation();
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[180] bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="template-title" onClick={onClose}>
      <div className="bg-white rounded-[32px] shadow-2xl max-w-lg w-full overflow-hidden animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
        <div className="p-6 pb-3 flex justify-between items-center border-b border-gray-100">
          <div>
            <h3 id="template-title" className="text-xl font-bold text-slate-800 tracking-tight">{t('template.startFromTemplate')}</h3>
            <p className="text-xs text-slate-500 mt-1">{t('template.chooseStartingPoint')}</p>
          </div>
          <IconButton icon="close" onClick={onClose} title={t('modal.close')} />
        </div>

        <div className="p-4 space-y-2 max-h-[60vh] overflow-y-auto">
          {PROJECT_TEMPLATES.map(t => (
            <button
              key={t.id}
              onClick={() => { onSelect(t); onClose(); }}
              className="w-full text-left p-4 rounded-[20px] hover:bg-indigo-50 transition-colors group flex items-start gap-4 border border-transparent hover:border-indigo-100"
            >
              <div className="w-12 h-12 rounded-[14px] bg-indigo-100 group-hover:bg-indigo-200 flex items-center justify-center shrink-0 transition-colors">
                <span className="material-symbols-rounded text-indigo-600 text-xl" aria-hidden="true">{t.icon}</span>
              </div>
              <div className="min-w-0">
                <p className="font-bold text-sm text-slate-800 group-hover:text-indigo-700 transition-colors">{t.name}</p>
                <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{t.description}</p>
              </div>
            </button>
          ))}
        </div>

        <div className="p-4 border-t border-gray-100 bg-slate-50">
          <Button variant="ghost" onClick={onClose} className="w-full">{t('template.startBlank')}</Button>
        </div>
      </div>
    </div>
  );
};
