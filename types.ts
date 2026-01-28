

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

export interface BOMEntry {
  instanceId: string;
  part: Part;
  quantity: number;
  parentInstanceId?: string;
  isCompatible: boolean;
  warnings?: string[];
  sourcing?: {
    loading?: boolean;
    data?: { options: { title: string; url: string; source: string }[] };
    manualUrl?: string;
  };
}

export interface GeneratedImage {
  id: string;
  url: string; // Base64 data URL
  prompt: string;
  timestamp: Date;
}

export interface UserMessage {
  role: 'user' | 'assistant';
  content: string;
  attachment?: string; // Base64 Data URL
  timestamp: Date;
}

export interface DraftingSession {
  id: string;
  slug: string;
  shareSlug?: string; // Custom user-defined slug for sharing (e.g., /sheet/my-custom-pc)
  ownerId: string;
  name: string;
  designRequirements: string;
  bom: BOMEntry[];
  visualManifest?: VisualManifest;
  generatedImages: GeneratedImage[];
  messages: UserMessage[];
  createdAt: Date;
  lastModified: Date;
}

export interface User {
  id: string;
  username: string;
  name: string;
  email: string;
  avatar: string;
}

export interface UserActivityLog {
  id: string;
  timestamp: Date;
  action: 'SESSION_INITIALIZED' | 'PART_ADDED' | 'PART_REMOVED' | 'DRAFT_COMMITTED' | 'IMAGE_GENERATED' | 'PART_UPDATED';
  metadata: any;
}