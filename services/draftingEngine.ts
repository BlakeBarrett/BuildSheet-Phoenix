import { Part, BOMEntry, DraftingSession, Gender, PortType, VisualManifest, GeneratedImage, UserMessage } from '../types.ts';
import { HARDWARE_REGISTRY } from '../data/seedData.ts';
import { ActivityLogService } from './activityLogService.ts';
import { UserService } from './userService.ts';

export class DraftingEngine {
  private session: DraftingSession;
  
  // Storage Keys
  private INDEX_KEY = 'buildsheet_projects_index';
  private ACTIVE_ID_KEY = 'buildsheet_active_project_id';
  private LEGACY_KEY = 'buildsheet_active_draft';
  private SESSION_PREFIX = 'buildsheet_project_';

  constructor() {
    this.session = this.loadInitialSession();
  }

  // --- PERSISTENCE MANAGER ---

  private loadInitialSession(): DraftingSession {
    // 1. Check for legacy data and migrate
    const legacyData = localStorage.getItem(this.LEGACY_KEY);
    if (legacyData) {
        try {
            const parsed = JSON.parse(legacyData);
            console.log("Migrating legacy session...", parsed.id);
            this.saveSessionToStorage(parsed); // Save to new format
            localStorage.removeItem(this.LEGACY_KEY);
            localStorage.setItem(this.ACTIVE_ID_KEY, parsed.id);
            return this.hydrateSession(parsed);
        } catch (e) {
            console.error("Legacy migration failed", e);
        }
    }

    // 2. Load Active Project ID
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

    // 3. Fallback: Create New
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
      lastModified: new Date()
    };
  }

  private saveSession() {
    this.session.lastModified = new Date();
    this.saveSessionToStorage(this.session);
  }

  private saveSessionToStorage(session: DraftingSession) {
    try {
        const key = this.SESSION_PREFIX + session.id;
        
        // Save Session Data
        this.persistWithQuotaManagement(key, session);

        // Update Index
        this.updateProjectIndex(session);

        // Set Active
        localStorage.setItem(this.ACTIVE_ID_KEY, session.id);

        if (UserService.getCurrentUser()) {
             ActivityLogService.log('DRAFT_COMMITTED', { sessionId: session.id });
        }
    } catch (e) {
        console.error("Persistence failed", e);
    }
  }

  private persistWithQuotaManagement(key: string, session: DraftingSession) {
    try {
        localStorage.setItem(key, JSON.stringify(session));
    } catch (e: any) {
        if (e.name === 'QuotaExceededError' || e.code === 22) {
             console.warn("Quota exceeded. Trimming history.");
             const trimmed = { ...session, generatedImages: [...session.generatedImages] };
             // Keep only latest 3 images in persisted storage if full
             while (trimmed.generatedImages.length > 3) {
                 trimmed.generatedImages.shift();
             }
             // If still failing, trim messages? (Not implemented yet to avoid data loss)
             try {
                localStorage.setItem(key, JSON.stringify(trimmed));
             } catch (innerE) {
                 console.error("Critical storage failure", innerE);
             }
        }
    }
  }

  private updateProjectIndex(session: DraftingSession) {
      try {
          const indexRaw = localStorage.getItem(this.INDEX_KEY);
          let index: any[] = indexRaw ? JSON.parse(indexRaw) : [];
          
          // Remove existing entry for this ID
          index = index.filter(i => i.id !== session.id);
          
          // Add updated entry to top
          index.unshift({
              id: session.id,
              name: session.name,
              lastModified: session.lastModified,
              preview: session.bom.length > 0 ? `${session.bom.length} Parts` : 'Empty Draft'
          });

          localStorage.setItem(this.INDEX_KEY, JSON.stringify(index));
      } catch (e) {
          console.warn("Failed to update project index", e);
      }
  }

  // --- PUBLIC API ---

  public getSession(): DraftingSession {
    return { ...this.session };
  }

  public getProjectList() {
      const raw = localStorage.getItem(this.INDEX_KEY);
      return raw ? JSON.parse(raw) : [];
  }

  public createNewProject() {
      this.session = this.createNewSessionTemplate();
      this.saveSession();
  }

  public loadProject(id: string): boolean {
      const raw = localStorage.getItem(this.SESSION_PREFIX + id);
      if (raw) {
          try {
              this.session = this.hydrateSession(JSON.parse(raw));
              localStorage.setItem(this.ACTIVE_ID_KEY, id);
              return true;
          } catch (e) {
              console.error("Load failed", e);
          }
      }
      return false;
  }

  public renameProject(id: string, newName: string) {
      // If renaming active session
      if (this.session.id === id) {
          this.session.name = newName;
          this.saveSession();
          return;
      }
      
      // If renaming inactive session
      try {
          const raw = localStorage.getItem(this.SESSION_PREFIX + id);
          if (raw) {
              const session = JSON.parse(raw);
              session.name = newName;
              session.lastModified = new Date(); // Update timestamp
              this.saveSessionToStorage(session);
          }
      } catch (e) {
          console.error("Failed to rename project", e);
      }
  }

  public deleteProject(id: string) {
      localStorage.removeItem(this.SESSION_PREFIX + id);
      const index = this.getProjectList().filter((p: any) => p.id !== id);
      localStorage.setItem(this.INDEX_KEY, JSON.stringify(index));
      
      if (this.session.id === id) {
          // If deleted active project, load the first available or create new
          if (index.length > 0) {
              this.loadProject(index[0].id);
          } else {
              this.createNewProject();
          }
      }
  }

  public updateOwner(ownerId: string) {
    this.session.ownerId = ownerId;
    this.saveSession();
  }

  public addMessage(message: UserMessage) {
      this.session.messages.push(message);
      this.saveSession();
  }

  public removeLastMessage() {
      if (this.session.messages.length > 0) {
          this.session.messages.pop();
          this.saveSession();
      }
  }

  public setVisualManifest(manifest: VisualManifest) {
    this.session.visualManifest = manifest;
    this.saveSession();
  }

  public initialize(name: string, requirements: string) {
    this.session.name = name;
    this.session.designRequirements = requirements;
    this.session.bom = [];
    this.session.visualManifest = undefined;
    
    // Keep images and messages? 
    // Usually 'initializeDraft' means a pivot in the CURRENT conversation.
    // So we keep images and messages.
    if (!this.session.generatedImages) this.session.generatedImages = [];
    
    ActivityLogService.log('SESSION_INITIALIZED', { name, requirements });
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
    ActivityLogService.log('IMAGE_GENERATED', { promptLength: prompt.length });
    this.saveSession();
  }

  public addPart(partId: string, quantity: number = 1): { success: boolean; message: string; entry?: BOMEntry } {
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
        description: 'Virtual component suggested by Architect.',
        ports: [] 
      };
    }

    const { isCompatible, warnings } = this.validateCompatibility(part);

    const entry: BOMEntry = {
      instanceId: `${part.id}-${Math.random().toString(36).substr(2, 5)}`,
      part,
      quantity,
      isCompatible: isVirtual ? true : isCompatible,
      warnings: isVirtual ? ['Virtual component: physical validation pending.'] : warnings
    };
    
    this.session.bom.push(entry);
    ActivityLogService.log('PART_ADDED', { partId, quantity, isCompatible, isVirtual });
    this.saveSession();

    return { 
      success: true, 
      message: isVirtual ? `Drafted: ${part.name}` : `Added: ${part.name}`,
      entry
    };
  }

  public removePart(instanceId: string) {
    const part = this.session.bom.find(b => b.instanceId === instanceId);
    this.session.bom = this.session.bom.filter(entry => entry.instanceId !== instanceId);
    ActivityLogService.log('PART_REMOVED', { instanceId, partId: part?.part.id });
    this.saveSession();
  }

  public updatePartSourcing(instanceId: string, sourcingData: any) {
    const entry = this.session.bom.find(b => b.instanceId === instanceId);
    if (entry) {
        if (!entry.sourcing) entry.sourcing = {};
        entry.sourcing.loading = false;
        entry.sourcing.data = sourcingData;
        this.saveSession();
    }
  }

  public setPartManualSource(instanceId: string, url: string) {
      const entry = this.session.bom.find(b => b.instanceId === instanceId);
      if (entry) {
          if (!entry.sourcing) entry.sourcing = {};
          entry.sourcing.manualUrl = url;
          this.saveSession();
      }
  }

  private validateCompatibility(newPart: Part): { isCompatible: boolean; warnings: string[] } {
    if (this.session.bom.length === 0 || newPart.ports.length === 0) return { isCompatible: true, warnings: [] };
    
    const warnings: string[] = [];
    let hasMatch = false;

    for (const newPort of newPart.ports) {
      for (const existingEntry of this.session.bom) {
        for (const existingPort of existingEntry.part.ports) {
          const genderMatch = (newPort.gender === Gender.MALE && existingPort.gender === Gender.FEMALE) ||
                             (newPort.gender === Gender.FEMALE && existingPort.gender === Gender.MALE) ||
                             (newPort.gender === Gender.NEUTRAL || existingPort.gender === Gender.NEUTRAL);
          
          if (newPort.spec === existingPort.spec && genderMatch) {
            hasMatch = true;
            break;
          }
        }
        if (hasMatch) break;
      }
    }

    if (!hasMatch) {
      warnings.push(`Port spec mismatch for ${newPart.name}.`);
    }

    return { isCompatible: hasMatch, warnings };
  }

  public getTotalCost(): number {
    return this.session.bom.reduce((acc, curr) => acc + (curr.part.price * curr.quantity), 0);
  }
}

// Lazy initialization
let instance: DraftingEngine | null = null;
export const getDraftingEngine = () => {
    if (!instance) {
        instance = new DraftingEngine();
    }
    return instance;
};