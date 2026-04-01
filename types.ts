
export enum PortType {
  MECHANICAL = 'MECHANICAL',
  ELECTRICAL = 'ELECTRICAL',
  DATA = 'DATA',
  FLUID = 'FLUID'
}

export enum Gender {
  MALE = 'MALE',
  FEMALE = 'FEMALE',
  NEUTRAL = 'NEUTRAL'
}

export interface PortDefinition {
  id: string;
  name: string;
  type: PortType;
  gender: Gender;
  spec: string;
}

export interface Part {
  id: string;
  sku: string;
  name: string;
  category: string;
  brand: string;
  price: number;
  ports: PortDefinition[];
  description: string;
}

export interface VisualComponent {
  partId: string;
  shape: 'box' | 'cylinder' | 'sphere';
  dims: [number, number, number]; // [width, height, depth] or [radius, height, 0]
  color: string;
  label: string;
}

export interface VisualManifest {
  stackAxis: 'x' | 'y' | 'z';
  components: VisualComponent[];
}

export interface ShoppingOption {
  title: string;
  url: string;
  source: string;
  price?: string;
  currency?: string;
  thumbnail?: string;
}

export interface LocalSupplier {
  name: string;
  address: string;
  rating?: number;
  openNow?: boolean;
  url?: string;
}

export interface DefectDefinition {
  name: string;
  severity: 'Critical' | 'Major' | 'Minor';
  description: string;
}

export interface InspectionProtocol {
  recommendedSensors: string[];
  defects: DefectDefinition[];
  inspectionStrategy: string;
}

export interface AssemblyStep {
  stepNumber: number;
  description: string;
  requiredTool: string;
  estimatedTime: string;
}

export interface AssemblyPlan {
  steps: AssemblyStep[];
  totalTime: string;
  difficulty: 'Easy' | 'Medium' | 'Hard' | 'Expert';
  requiredEndEffectors: string[];
  automationFeasibility: number; // 0-100
  notes: string;
  generatedAt: Date;
}

export interface EnclosureSpec {
  material: string;
  dimensions: string;
  openSCAD?: string;
  description: string;
  renderUrl?: string;
}

export interface BOMEntry {
  instanceId: string;
  part: Part;
  quantity: number;
  parentInstanceId?: string;
  isCompatible: boolean;
  warnings?: string[];
  sourcing?: {
    loading?: boolean;
    online?: ShoppingOption[];
    local?: LocalSupplier[];
    manualUrl?: string;
    lastUpdated?: Date;
  };
  qaProtocol?: InspectionProtocol;
  fabricationBrief?: string;
  enclosure?: EnclosureSpec;
}

export interface GeneratedImage {
  id: string;
  url: string; // Base64 data URL
  prompt: string;
  timestamp: Date;
}

export interface UserMessageMetadata {
  model?: string;
  tokens?: number;
  latencyMs?: number;
  [key: string]: any;
}

export interface UserMessage {
  role: 'user' | 'assistant';
  content: string;
  attachment?: string; // Base64 Data URL
  timestamp: Date;
  stateSnapshotJSON?: string;
  metadata?: UserMessageMetadata;
}

export interface DraftingSession {
  id: string;
  slug: string;
  shareSlug?: string;
  ownerId: string;
  name: string;
  designRequirements: string;
  bom: BOMEntry[];
  visualManifest?: VisualManifest;
  generatedImages: GeneratedImage[];
  messages: UserMessage[];
  createdAt: Date;
  lastModified: Date;
  // Caching & Validation
  cachedAuditResult?: string;
  cachedAuditActions?: { type: 'addPart' | 'removePart'; partId?: string; name?: string; category?: string; quantity?: number; instanceId?: string; reason: string }[];
  cachedAssemblyPlan?: AssemblyPlan;
  advancedValidations?: AdvancedValidationOption[];
  cacheIsDirty: boolean; // True if BOM changed since last audit/plan
  // Project metadata — stored here so they survive Firestore round-trips
  archived?: boolean;
  tags?: string[];
}

export interface User {
  id: string;
  username: string;
  name: string;
  email: string;
  avatar: string;
}

export interface AdvancedValidationOption {
  id: string;
  label: string;
  enabled: boolean;
  /** Built-in checks are 'builtin'; user-created ones are 'custom' */
  kind: 'builtin' | 'custom';
  /** Optional user-provided value (e.g. VIN for vin-lookup). */
  metadata?: string;
}

export const DEFAULT_ADVANCED_VALIDATIONS: AdvancedValidationOption[] = [
  { id: 'vin-lookup',           label: 'VIN / Serial Number Lookup', enabled: false, kind: 'builtin' },
  { id: 'patent-verification',  label: 'Patent & IP Verification',   enabled: false, kind: 'builtin' },
];

export interface UserActivityLog {
  id: string;
  timestamp: Date;
  action: 'SESSION_INITIALIZED' | 'PART_ADDED' | 'PART_REMOVED' | 'DRAFT_COMMITTED' | 'IMAGE_GENERATED' | 'PART_UPDATED' | 'ENCLOSURE_GENERATED';
  metadata: any;
}
