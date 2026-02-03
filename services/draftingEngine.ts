
import { Part, BOMEntry, DraftingSession, Gender, PortType, VisualManifest, GeneratedImage, UserMessage, AssemblyPlan } from '../types.ts';
import { HARDWARE_REGISTRY } from '../data/seedData.ts';
import { ActivityLogService } from './activityLogService.ts';
import { UserService } from './userService.ts';

export class DraftingEngine {
  private session: DraftingSession;
  
  // Storage Keys
  private INDEX_KEY = 'buildsheet_projects_index';
  private ACTIVE_ID_KEY = 'buildsheet_active_project_id';
  private SESSION_PREFIX = 'buildsheet_project_';

  constructor() {
    this.session = this.loadInitialSession();
  }

  private loadInitialSession(): DraftingSession {
    const activeId = localStorage.getItem(this.ACTIVE_ID_KEY);
    if (activeId) {
        const storedSession = localStorage.getItem(this.SESSION_PREFIX + activeId);
        if (storedSession) {
            try {
                return this.hydrateSession(JSON.parse(storedSession));
            } catch (e) {
                console.error("Failed to parse active session", e);
            }
        }
    }

    const newSession = this.createNewSessionTemplate();
    this.saveSessionToStorage(newSession);
    localStorage.setItem(this.ACTIVE_ID_KEY, newSession.id);
    return newSession;
  }

  private hydrateSession(data: any): DraftingSession {
    return {
        ...data,
        createdAt: new Date(data.createdAt),
        lastModified: data.lastModified ? new Date(data.lastModified) : new Date(),
        cacheIsDirty: data.cacheIsDirty ?? true,
        generatedImages: data.generatedImages?.map((img: any) => ({
            ...img,
            timestamp: new Date(img.timestamp)
        })) || [],
        messages: data.messages?.map((msg: any) => ({
            ...msg,
            timestamp: new Date(msg.timestamp)
        })) || []
    };
  }

  private createNewSessionTemplate(): DraftingSession {
    const user = UserService.getCurrentUser();
    const id = Math.random().toString(36).substr(2, 9);
    return {
      id,
      slug: `build-${id.substr(0,4)}`,
      ownerId: user?.id || 'anonymous',
      name: 'Untitled Assembly',
      designRequirements: '',
      bom: [],
      generatedImages: [],
      messages: [],
      createdAt: new Date(),
      lastModified: new Date(),
      cacheIsDirty: true
    };
  }

  private saveSession() {
    this.session.lastModified = new Date();
    this.saveSessionToStorage(this.session);
  }

  private saveSessionToStorage(session: DraftingSession) {
    try {
        const key = this.SESSION_PREFIX + session.id;
        localStorage.setItem(key, JSON.stringify(session));
        this.updateProjectIndex(session);
        localStorage.setItem(this.ACTIVE_ID_KEY, session.id);
    } catch (e) {
        console.error("Persistence failed", e);
    }
  }

  private updateProjectIndex(session: DraftingSession) {
      try {
          const indexRaw = localStorage.getItem(this.INDEX_KEY);
          let index: any[] = indexRaw ? JSON.parse(indexRaw) : [];
          index = index.filter(i => i.id !== session.id);
          index.unshift({
              id: session.id,
              name: session.name,
              shareSlug: session.shareSlug,
              lastModified: session.lastModified,
              preview: session.bom.length > 0 ? `${session.bom.length} Parts` : 'Empty Draft'
          });
          localStorage.setItem(this.INDEX_KEY, JSON.stringify(index));
      } catch (e) {
          console.warn("Failed to update project index", e);
      }
  }

  public getSession(): DraftingSession {
    return { ...this.session };
  }

  public createNewProject() {
      this.session = this.createNewSessionTemplate();
      this.saveSession();
  }

  public addPart(partId: string, quantity: number = 1) {
    let part = HARDWARE_REGISTRY.find(p => p.id === partId);
    let isVirtual = false;

    if (!part) {
      isVirtual = true;
      part = {
        id: partId,
        sku: `DRAFT-${partId.toUpperCase()}`,
        name: partId.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' '),
        category: 'Inferred Component',
        brand: 'Design Placeholder',
        price: 0,
        description: 'Virtual component suggested by Gemini.',
        ports: [] 
      };
    }

    const existingEntry = this.session.bom.find(b => b.part.id === part!.id);
    if (existingEntry) {
        this.updatePartQuantity(existingEntry.instanceId, existingEntry.quantity + quantity);
    } else {
        const entry: BOMEntry = {
          instanceId: `${part.id}-${Math.random().toString(36).substr(2, 5)}`,
          part,
          quantity,
          isCompatible: true
        };
        this.session.bom.push(entry);
    }
    
    this.session.cacheIsDirty = true;
    this.saveSession();
  }

  public updatePartQuantity(instanceId: string, quantity: number) {
    const entry = this.session.bom.find(b => b.instanceId === instanceId);
    if (entry) {
        entry.quantity = Math.max(1, quantity);
        this.session.cacheIsDirty = true;
        this.saveSession();
    }
  }

  public removePart(instanceId: string) {
    this.session.bom = this.session.bom.filter(entry => entry.instanceId !== instanceId);
    this.session.cacheIsDirty = true;
    this.saveSession();
  }

  public cacheAuditResult(result: string) {
      this.session.cachedAuditResult = result;
      this.session.cacheIsDirty = false;
      this.saveSession();
  }

  public cacheAssemblyPlan(plan: AssemblyPlan) {
      this.session.cachedAssemblyPlan = plan;
      this.session.cacheIsDirty = false;
      this.saveSession();
  }

  public updatePartSourcing(instanceId: string, onlineData: any) {
    const entry = this.session.bom.find(b => b.instanceId === instanceId);
    if (entry) {
        if (!entry.sourcing) entry.sourcing = {};
        entry.sourcing.loading = false;
        entry.sourcing.online = onlineData;
        entry.sourcing.lastUpdated = new Date();
        this.saveSession();
    }
  }

  public getTotalCost(): number {
    return this.session.bom.reduce((acc, curr) => acc + (curr.part.price * curr.quantity), 0);
  }

  public initialize(name: string, requirements: string) {
      this.session.name = name;
      this.session.designRequirements = requirements;
      this.session.bom = [];
      this.session.cacheIsDirty = true;
      this.saveSession();
  }

  public addMessage(message: UserMessage) {
      this.session.messages.push(message);
      this.saveSession();
  }

  public addGeneratedImage(url: string, prompt: string) {
      const img: GeneratedImage = {
          id: Math.random().toString(36).substr(2, 9),
          url,
          prompt,
          timestamp: new Date()
      };
      this.session.generatedImages.push(img);
      this.saveSession();
  }

  public updateOwner(ownerId: string) {
      this.session.ownerId = ownerId;
      this.saveSession();
  }

  public exportManifest(): string {
    return JSON.stringify(this.session, null, 2);
  }

  public getSourcingCompletion(): number {
    if (this.session.bom.length === 0) return 100;
    const sourcedCount = this.session.bom.filter(b => b.sourcing?.online && b.sourcing.online.length > 0).length;
    return Math.round((sourcedCount / this.session.bom.length) * 100);
  }
}

let instance: DraftingEngine | null = null;
export const getDraftingEngine = () => {
    if (!instance) instance = new DraftingEngine();
    return instance;
};
