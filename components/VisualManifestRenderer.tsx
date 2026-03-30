import React, { useMemo } from 'react';
import { VisualManifest, VisualComponent, BOMEntry } from '../types.ts';

interface VisualManifestRendererProps {
  manifest: VisualManifest;
  bom: BOMEntry[];
  onComponentClick?: (partId: string) => void;
}

const PADDING = 24;
const GAP = 16;
const PORT_RADIUS = 5;

function shapeElement(comp: VisualComponent, x: number, y: number, w: number, h: number, isHovered: boolean): React.ReactNode {
  const strokeColor = isHovered ? '#4F46E5' : '#94A3B8';
  const strokeWidth = isHovered ? 2.5 : 1.5;
  const fillOpacity = isHovered ? 0.95 : 0.85;

  switch (comp.shape) {
    case 'cylinder':
      return (
        <g>
          <ellipse cx={x + w / 2} cy={y + 10} rx={w / 2} ry={10} fill={comp.color} fillOpacity={fillOpacity} stroke={strokeColor} strokeWidth={strokeWidth} />
          <rect x={x} y={y + 10} width={w} height={h - 20} fill={comp.color} fillOpacity={fillOpacity} stroke="none" />
          <line x1={x} y1={y + 10} x2={x} y2={y + h - 10} stroke={strokeColor} strokeWidth={strokeWidth} />
          <line x1={x + w} y1={y + 10} x2={x + w} y2={y + h - 10} stroke={strokeColor} strokeWidth={strokeWidth} />
          <ellipse cx={x + w / 2} cy={y + h - 10} rx={w / 2} ry={10} fill={comp.color} fillOpacity={fillOpacity} stroke={strokeColor} strokeWidth={strokeWidth} />
        </g>
      );
    case 'sphere':
      return (
        <ellipse cx={x + w / 2} cy={y + h / 2} rx={w / 2} ry={h / 2} fill={comp.color} fillOpacity={fillOpacity} stroke={strokeColor} strokeWidth={strokeWidth} />
      );
    default: // box
      return (
        <rect x={x} y={y} width={w} height={h} rx={8} ry={8} fill={comp.color} fillOpacity={fillOpacity} stroke={strokeColor} strokeWidth={strokeWidth} />
      );
  }
}

export const VisualManifestRenderer: React.FC<VisualManifestRendererProps> = ({ manifest, bom, onComponentClick }) => {
  const [hoveredId, setHoveredId] = React.useState<string | null>(null);

  const layout = useMemo(() => {
    const components = manifest.components;
    if (components.length === 0) return { items: [], width: 0, height: 0, connections: [] };

    const SCALE = 1.2;
    const isHorizontal = manifest.stackAxis === 'x';

    // Compute scaled dimensions
    const scaled = components.map(c => ({
      ...c,
      w: Math.max(80, c.dims[0] * SCALE),
      h: Math.max(50, c.dims[1] * SCALE),
    }));

    // Layout along the stack axis
    let cursor = PADDING;
    const items = scaled.map(c => {
      const item = { ...c, x: 0, y: 0 };
      if (isHorizontal) {
        item.x = cursor;
        item.y = PADDING;
        cursor += c.w + GAP;
      } else {
        item.x = PADDING;
        item.y = cursor;
        cursor += c.h + GAP;
      }
      return item;
    });

    // Center items on the cross axis
    const maxCross = isHorizontal
      ? Math.max(...items.map(i => i.h))
      : Math.max(...items.map(i => i.w));

    items.forEach(item => {
      if (isHorizontal) {
        item.y = PADDING + (maxCross - item.h) / 2;
      } else {
        item.x = PADDING + (maxCross - item.w) / 2;
      }
    });

    const width = isHorizontal
      ? cursor - GAP + PADDING
      : maxCross + PADDING * 2;
    const height = isHorizontal
      ? maxCross + PADDING * 2 + 30 // extra for labels
      : cursor - GAP + PADDING + 30;

    // Port connection lines between adjacent components
    const connections: { x1: number; y1: number; x2: number; y2: number }[] = [];
    for (let i = 0; i < items.length - 1; i++) {
      const a = items[i];
      const b = items[i + 1];
      // Find if these parts share compatible port specs
      const partA = bom.find(e => e.part.id === a.partId);
      const partB = bom.find(e => e.part.id === b.partId);
      if (partA && partB) {
        const shared = partA.part.ports.some(pa =>
          partB.part.ports.some(pb => pa.spec === pb.spec && pa.spec !== '')
        );
        if (shared || true) { // Always draw connection between adjacent items
          if (isHorizontal) {
            connections.push({
              x1: a.x + a.w,
              y1: a.y + a.h / 2,
              x2: b.x,
              y2: b.y + b.h / 2,
            });
          } else {
            connections.push({
              x1: a.x + a.w / 2,
              y1: a.y + a.h,
              x2: b.x + b.w / 2,
              y2: b.y,
            });
          }
        }
      }
    }

    return { items, width, height, connections };
  }, [manifest, bom]);

  if (layout.items.length === 0) {
    return (
      <div className="h-full flex items-center justify-center text-slate-400 text-sm">
        <span className="material-symbols-rounded mr-2">schema</span>
        No components in manifest
      </div>
    );
  }

  return (
    <div className="h-full w-full overflow-auto bg-[#F8FAFC] rounded-[16px] border border-gray-100">
      <svg
        viewBox={`0 0 ${layout.width} ${layout.height}`}
        className="w-full h-auto"
        role="img"
        aria-label="Block diagram of hardware components"
      >
        {/* Connection lines */}
        {layout.connections.map((conn, i) => (
          <line
            key={`conn-${i}`}
            x1={conn.x1}
            y1={conn.y1}
            x2={conn.x2}
            y2={conn.y2}
            stroke="#CBD5E1"
            strokeWidth={2}
            strokeDasharray="6 3"
            markerEnd="url(#arrowhead)"
          />
        ))}

        {/* Arrowhead marker */}
        <defs>
          <marker id="arrowhead" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
            <polygon points="0 0, 8 3, 0 6" fill="#CBD5E1" />
          </marker>
        </defs>

        {/* Component blocks */}
        {layout.items.map((item) => {
          const isHovered = hoveredId === item.partId;
          const bomEntry = bom.find(e => e.part.id === item.partId);
          const ports = bomEntry?.part.ports || [];

          return (
            <g
              key={item.partId}
              className="cursor-pointer"
              tabIndex={0}
              role="button"
              aria-label={item.label}
              onMouseEnter={() => setHoveredId(item.partId)}
              onMouseLeave={() => setHoveredId(null)}
              onClick={() => onComponentClick?.(item.partId)}
              onKeyDown={(e: React.KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onComponentClick?.(item.partId); } }}
              onFocus={() => setHoveredId(item.partId)}
              onBlur={() => setHoveredId(null)}
            >
              {/* Drop shadow */}
              {isHovered && (
                <rect
                  x={item.x + 2}
                  y={item.y + 3}
                  width={item.w}
                  height={item.h}
                  rx={8}
                  fill="rgba(0,0,0,0.08)"
                />
              )}

              {/* Shape */}
              {shapeElement(item, item.x, item.y, item.w, item.h, isHovered)}

              {/* Label */}
              <text
                x={item.x + item.w / 2}
                y={item.y + item.h / 2}
                textAnchor="middle"
                dominantBaseline="central"
                className="pointer-events-none select-none"
                fill={isHovered ? '#312E81' : '#334155'}
                fontSize={Math.min(12, item.w / (item.label.length * 0.6))}
                fontWeight={isHovered ? 700 : 600}
                fontFamily="-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
              >
                {item.label.length > 16 ? item.label.substring(0, 14) + '…' : item.label}
              </text>

              {/* Port indicators */}
              {ports.slice(0, 4).map((port, pi) => {
                const portX = item.x + ((pi + 1) / (Math.min(ports.length, 4) + 1)) * item.w;
                const portY = item.y + item.h;
                const portColor = port.type === 'ELECTRICAL' ? '#F59E0B' :
                  port.type === 'MECHANICAL' ? '#6366F1' :
                  port.type === 'DATA' ? '#10B981' :
                  port.type === 'FLUID' ? '#3B82F6' : '#94A3B8';
                return (
                  <circle
                    key={`port-${item.partId}-${pi}`}
                    cx={portX}
                    cy={portY}
                    r={PORT_RADIUS}
                    fill={portColor}
                    stroke="white"
                    strokeWidth={1.5}
                  >
                    <title>{port.name} ({port.type})</title>
                  </circle>
                );
              })}
            </g>
          );
        })}
      </svg>
    </div>
  );
};
