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
              shareSlug: session.shareSlug,
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

  public findProjectBySlug(slug: string): string | null {
      // 1. Check current session
      if (this.session.shareSlug === slug) return this.session.id;

      // 2. Check index
      const list = this.getProjectList();
      const match = list.find((p: any) => p.shareSlug === slug);
      if (match) return match.id;

      return null;
  }

  public setShareSlug(slug: string): { success: boolean, message?: string } {
      const cleanSlug = slug.toLowerCase().replace(/[^a-z0-9-]/g, '');
      if (cleanSlug.length < 3) return { success: false, message: "Slug too short (min 3 chars)" };

      // Check for collision
      const list = this.getProjectList();
      const conflict = list.find((p: any) => p.shareSlug === cleanSlug && p.id !== this.session.id);
      
      if (conflict) return { success: false, message: "Slug already taken" };

      this.session.shareSlug = cleanSlug;
      this.saveSession();
      return { success: true };
  }

  public exportProject(id: string): string | null {
      const raw = localStorage.getItem(this.SESSION_PREFIX + id);
      if (raw) {
          try {
              // Beautify JSON for export
              return JSON.stringify(JSON.parse(raw), null, 2);
          } catch (e) {
              console.error("Export failed parsing", e);
          }
      }
      return null;
  }

  public importProject(jsonString: string): string | null {
      try {
          const data = JSON.parse(jsonString);
          
          // Basic validation (check for required fields)
          if (!data.messages || !Array.isArray(data.bom)) {
              throw new Error("Invalid project file format");
          }

          // Generate new ID to act as a copy/import
          const newId = Math.random().toString(36).substr(2, 9);
          const user = UserService.getCurrentUser();
          
          const newSession: DraftingSession = {
              ...data,
              id: newId,
              slug: `build-${newId.substr(0,4)}`,
              shareSlug: undefined, // Clear slug on import to avoid conflicts
              ownerId: user?.id || 'anonymous',
              name: `${data.name} (Imported)`,
              createdAt: new Date(),
              lastModified: new Date()
          };

          // Save and set active
          this.session = this.hydrateSession(newSession);
          this.saveSession();
          
          return newId;
      } catch (e) {
          console.error("Import failed", e);
          return null;
      }
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
        description: 'Virtual component suggested by Gemini.',
        ports: [] 
      };
    }

    // Check if part already exists, if so, just increment quantity
    const existingEntry = this.session.bom.find(b => b.part.id === part!.id);
    if (existingEntry) {
        this.updatePartQuantity(existingEntry.instanceId, existingEntry.quantity + quantity);
        return {
            success: true,
            message: `Updated: ${part.name} quantity to ${existingEntry.quantity}`,
            entry: existingEntry
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

  public updatePartQuantity(instanceId: string, quantity: number) {
    const entry = this.session.bom.find(b => b.instanceId === instanceId);
    if (entry) {
        entry.quantity = Math.max(1, quantity);
        // Re-validate cost or compatibility if dependent (not complex logic yet)
        this.saveSession();
        ActivityLogService.log('PART_UPDATED', { instanceId, newQuantity: quantity });
    }
  }

  public removePart(instanceId: string) {
    const part = this.session.bom.find(b => b.instanceId === instanceId);
    this.session.bom = this.session.bom.filter(entry => entry.instanceId !== instanceId);
    ActivityLogService.log('PART_REMOVED', { instanceId, partId: part?.part.id });
    this.saveSession();
  }

  public searchRegistry(query: string): Part[] {
      const q = query.toLowerCase();
      return HARDWARE_REGISTRY.filter(p => 
          p.name.toLowerCase().includes(q) || 
          p.category.toLowerCase().includes(q) ||
          p.sku.toLowerCase().includes(q)
      );
  }

  public updatePartSourcing(instanceId: string, onlineData: any) {
    const entry = this.session.bom.find(b => b.instanceId === instanceId);
    if (entry) {
        if (!entry.sourcing) entry.sourcing = {};
        entry.sourcing.loading = false;
        entry.sourcing.online = onlineData;
        entry.sourcing.lastUpdated = new Date();

        // Calculate and apply lowest price if component is currently unset (price 0)
        if (Array.isArray(onlineData) && onlineData.length > 0) {
            const prices = onlineData
                .map((opt: any) => parseFloat(opt.price?.replace(/[^0-9.]/g, '') || '0'))
                .filter((p: number) => !isNaN(p) && p > 0);
            
            if (prices.length > 0) {
                const estimatedCost = Math.min(...prices);
                // Update the part price if it's currently 0 (placeholder/virtual)
                if (entry.part.price === 0) {
                    entry.part.price = estimatedCost;
                }
            }
        }

        this.saveSession();
    }
  }

  public updatePartLocalSuppliers(instanceId: string, localData: any) {
      const entry = this.session.bom.find(b => b.instanceId === instanceId);
      if (entry) {
          if (!entry.sourcing) entry.sourcing = {};
          entry.sourcing.loading = false;
          entry.sourcing.local = localData;
          this.saveSession();
      }
  }

  public updatePartQAProtocol(instanceId: string, protocol: any) {
      const entry = this.session.bom.find(b => b.instanceId === instanceId);
      if (entry) {
          if (!entry.sourcing) entry.sourcing = {};
          entry.sourcing.loading = false;
          entry.qaProtocol = protocol;
          this.saveSession();
      }
  }

  public updatePartFabricationBrief(instanceId: string, brief: string) {
      const entry = this.session.bom.find(b => b.instanceId === instanceId);
      if (entry) {
          entry.fabricationBrief = brief;
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