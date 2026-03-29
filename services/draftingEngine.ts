import { Part, BOMEntry, DraftingSession, Gender, PortType, VisualManifest, GeneratedImage, UserMessage, AssemblyPlan } from '../types.ts';
import { ActivityLogService } from './activityLogService.ts';
import { UserService } from './userService.ts';
import { get, set, del } from 'idb-keyval';

export interface ProjectIndexEntry {
  id: string;
  name: string;
  lastModified: Date;
  preview: string;
  thumbnail?: string; // Latest generated image for the navigator
}

export class DraftingEngine {
  private session: DraftingSession;

  // Undo/Redo stacks (BOM snapshots)
  private undoStack: string[] = [];
  private redoStack: string[] = [];
  private static MAX_UNDO = 50;

  // Storage Keys
  private INDEX_KEY = 'buildsheet_projects_index';
  private ACTIVE_ID_KEY = 'buildsheet_active_project_id';
  private SESSION_PREFIX = 'buildsheet_project_';

  private onImagesLoaded?: () => void;

  public setOnImagesLoaded(cb: () => void) {
    this.onImagesLoaded = cb;
    // Trigger immediately if images were already loaded synchronously during hydrated states or prior
    if (this.session.generatedImages.length > 0) {
        cb();
    }
  }

  constructor() {
    this.session = this.loadInitialSession();
    this.saveSession();
    this.loadImagesAsync();
  }

  private loadImagesAsync() {
    get(this.SESSION_PREFIX + this.session.id + '_images').then((images: any) => {
        if (images && Array.isArray(images)) {
            this.session.generatedImages = images.map(img => ({
                ...img,
                timestamp: new Date(img.timestamp)
            }));
            if (this.onImagesLoaded) this.onImagesLoaded();
        }
    }).catch(e => console.error("IDB load failed", e));
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
    return newSession;
  }

  private hydrateSession(data: any): DraftingSession {
    return {
      ...data,
      createdAt: new Date(data.createdAt),
      lastModified: data.lastModified ? new Date(data.lastModified) : new Date(),
      cacheIsDirty: data.cacheIsDirty ?? true,
      cachedAuditResult: data.cachedAuditResult,
      cachedAssemblyPlan: data.cachedAssemblyPlan ? {
        ...data.cachedAssemblyPlan,
        generatedAt: new Date(data.cachedAssemblyPlan.generatedAt)
      } : undefined,
      // Deep-clone BOM entries to preserve sourcing/hydration data across navigation
      bom: (data.bom || []).map((entry: any) => ({
        ...entry,
        part: { ...entry.part, ports: entry.part.ports ? [...entry.part.ports] : [] },
        sourcing: entry.sourcing ? {
          ...entry.sourcing,
          online: entry.sourcing.online ? [...entry.sourcing.online] : undefined,
          local: entry.sourcing.local ? [...entry.sourcing.local] : undefined,
          lastUpdated: entry.sourcing.lastUpdated ? new Date(entry.sourcing.lastUpdated) : undefined
        } : undefined
      })),
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

  private static generateShareSlug(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .substring(0, 64) || 'untitled';
  }

  private createNewSessionTemplate(): DraftingSession {
    const user = UserService.getCurrentUser();
    const id = Math.random().toString(36).substr(2, 9);
    const name = 'Untitled Assembly';
    return {
      id,
      slug: `build-${id.substr(0, 4)}`,
      shareSlug: DraftingEngine.generateShareSlug(name),
      ownerId: user?.id || 'anonymous',
      name,
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

      // Always strip images from localStorage to prevent 5MB quota exhaustion
      const sessionNoImages = {
        ...session,
        generatedImages: []
      };

      try {
        localStorage.setItem(key, JSON.stringify(sessionNoImages));
      } catch (e: any) {
        console.error("Local storage quota exceeded even without images.", e);
      }

      // Persist images boundlessly to IndexedDB
      if (session.generatedImages.length > 0) {
         set(key + '_images', session.generatedImages).catch(e => console.error("IDB save failed", e));
      }

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
      // Clean duplicates
      index = index.filter(i => i.id !== session.id);
      index.unshift({
        id: session.id,
        name: session.name,
        lastModified: session.lastModified,
        preview: session.bom.length > 0 ? `${session.bom.length} Parts` : 'Empty Draft',
        thumbnail: undefined // DISABLE THUMBNAILS to save space in the index
      });
      localStorage.setItem(this.INDEX_KEY, JSON.stringify(index));
    } catch (e) {
      console.warn("Failed to update project index", e);
    }
  }

  public getProjectsList(): ProjectIndexEntry[] {
    const indexRaw = localStorage.getItem(this.INDEX_KEY);
    if (!indexRaw) return [];
    try {
      const parsed = JSON.parse(indexRaw);
      return parsed.map((p: any) => ({
        ...p,
        lastModified: new Date(p.lastModified)
      }));
    } catch (e) {
      return [];
    }
  }

  public loadProject(id: string) {
    const stored = localStorage.getItem(this.SESSION_PREFIX + id);
    if (stored) {
      this.session = this.hydrateSession(JSON.parse(stored));
      this.saveSession(); // Updates modified date and moves to top of index
      this.loadImagesAsync();
    }
  }

  public deleteProject(id: string) {
    localStorage.removeItem(this.SESSION_PREFIX + id);
    del(this.SESSION_PREFIX + id + '_images').catch(console.error);
    const indexRaw = localStorage.getItem(this.INDEX_KEY);
    if (indexRaw) {
      let index = JSON.parse(indexRaw);
      index = index.filter((i: any) => i.id !== id);
      localStorage.setItem(this.INDEX_KEY, JSON.stringify(index));
    }
    // If we deleted the active one, start fresh
    if (this.session.id === id) {
      this.createNewProject();
    }
  }

  public getSession(): DraftingSession {
    return { ...this.session };
  }

  public createNewProject() {
    this.session = this.createNewSessionTemplate();
    this.saveSession();
  }

  public addPart(partId: string, name?: string, category?: string, quantity: number = 1) {
    this.pushUndo();
    const part: Part = {
      id: partId,
      sku: `DRAFT-${partId.toUpperCase()}`,
      name: name || partId.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' '),
      category: category || 'Component',
      brand: 'TBD',
      price: 0,
      description: `${category || 'Component'} added by architect.`,
      ports: []
    };

    const existingEntry = this.session.bom.find(b => b.part.id === part.id);
    if (existingEntry) {
      this.updatePartQuantity(existingEntry.instanceId, existingEntry.quantity + quantity);
    } else {
      const entry: BOMEntry = {
        instanceId: `${part.id}-${Math.random().toString(36).substr(2, 5)}`,
        part: { ...part },
        quantity,
        isCompatible: true
      };
      this.session.bom.push(entry);
    }

    this.session.cacheIsDirty = true;
    this.saveSession();
  }

  public updatePartDetails(instanceId: string, details: Partial<Part>) {
    const entry = this.session.bom.find(b => b.instanceId === instanceId);
    if (entry) {
      this.pushUndo();
      if (details.name) entry.part.name = details.name;
      if (details.brand) entry.part.brand = details.brand;
      if (details.description) entry.part.description = details.description;
      if (details.price !== undefined && details.price > 0) entry.part.price = details.price;
      if (details.ports && details.ports.length > 0) entry.part.ports = details.ports;
      if (details.sku) entry.part.sku = details.sku;
      this.session.cacheIsDirty = true;
      this.saveSession();
    }
  }

  public updatePartQuantity(instanceId: string, quantity: number) {
    const entry = this.session.bom.find(b => b.instanceId === instanceId);
    if (entry) {
      this.pushUndo();
      entry.quantity = Math.max(1, quantity);
      this.session.cacheIsDirty = true;
      this.saveSession();
    }
  }

  public removePart(instanceId: string) {
    this.pushUndo();
    // Also unparent any children of the removed part
    this.session.bom.forEach(entry => {
      if (entry.parentInstanceId === instanceId) {
        entry.parentInstanceId = undefined;
      }
    });
    this.session.bom = this.session.bom.filter(entry => entry.instanceId !== instanceId);
    this.session.cacheIsDirty = true;
    this.saveSession();
  }

  public cacheAuditResult(result: string) {
    this.session.cachedAuditResult = result;
    this.session.cachedAuditActions = undefined; // Clear stale actions; they'll be pre-computed after
    this.session.cacheIsDirty = false;
    this.saveSession();
  }

  public cacheAuditActions(actions: DraftingSession['cachedAuditActions']) {
    this.session.cachedAuditActions = actions;
    this.saveSession();
  }

  public cacheAssemblyPlan(plan: AssemblyPlan) {
    this.session.cachedAssemblyPlan = plan;
    this.session.cacheIsDirty = false;
    this.saveSession();
  }

  public updatePartSourcing(instanceId: string, onlineData: any, localData?: any) {
    const entry = this.session.bom.find(b => b.instanceId === instanceId);
    if (entry) {
      if (!entry.sourcing) entry.sourcing = {};
      entry.sourcing.loading = false;
      entry.sourcing.online = onlineData || [];
      if (localData) entry.sourcing.local = localData;
      entry.sourcing.lastUpdated = new Date();

      if (onlineData && onlineData.length > 0) {
        const prices = onlineData
          .map((opt: any) => {
            const str = (opt.price || opt.title || "").toString();
            const match = str.match(/(?:\$|)\s?(\d+[\d,.]*)/);
            if (match) {
              const val = parseFloat(match[1].replace(/,/g, ''));
              return isNaN(val) ? null : val;
            }
            return null;
          })
          .filter((p: number | null) => p !== null && p > 0);

        if (prices.length > 0) {
          entry.part.price = Math.min(...prices);
        } else if (entry.part.price === 0) {
          entry.part.price = 14.99;
        }
      }

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
    if (!message.stateSnapshotJSON) {
      message.stateSnapshotJSON = JSON.stringify({
        name: this.session.name,
        designRequirements: this.session.designRequirements,
        bom: this.session.bom
      });
    }
    this.session.messages.push(message);
    this.saveSession();
  }

  public revertToMessage(messageIndex: number) {
    if (messageIndex < -1 || messageIndex >= this.session.messages.length) return;
    
    if (messageIndex === -1) {
      this.session.name = 'Untitled Assembly';
      this.session.designRequirements = '';
      this.session.bom = [];
      this.session.cacheIsDirty = true;
      this.session.cachedAssemblyPlan = undefined;
      this.session.cachedAuditResult = undefined;
      this.session.messages = [];
      this.saveSession();
      return;
    }

    const targetMsg = this.session.messages[messageIndex];
    if (targetMsg.stateSnapshotJSON) {
      try {
        const snapshot = JSON.parse(targetMsg.stateSnapshotJSON);
        this.session.name = snapshot.name;
        this.session.designRequirements = snapshot.designRequirements;
        this.session.bom = snapshot.bom;
        this.session.cacheIsDirty = true;
        this.session.cachedAssemblyPlan = undefined;
        this.session.cachedAuditResult = undefined;
      } catch (e) {
        console.error("Failed to parse message state snapshot", e);
      }
    }
    
    // Truncate messages after this point
    this.session.messages = this.session.messages.slice(0, messageIndex + 1);
    this.saveSession();
  }

  public forkFromMessage(messageIndex: number): string {
    if (messageIndex < -1 || messageIndex >= this.session.messages.length) return this.session.id;
    
    if (messageIndex === -1) {
       this.createNewProject();
       return this.session.id;
    }

    const targetMsg = this.session.messages[messageIndex];
    const user = UserService.getCurrentUser();
    const id = Math.random().toString(36).substr(2, 9);
    
    let state = {
        name: this.session.name + ' (Fork)',
        designRequirements: this.session.designRequirements,
        bom: JSON.parse(JSON.stringify(this.session.bom))
    };
    
    if (targetMsg.stateSnapshotJSON) {
        try {
            let snapshot = JSON.parse(targetMsg.stateSnapshotJSON);
            state.name = snapshot.name + ' (Fork)';
            state.designRequirements = snapshot.designRequirements;
            state.bom = snapshot.bom;
        } catch (e) {}
    }

    const forkedSession: DraftingSession = {
      id,
      slug: `build-${id.substr(0, 4)}`,
      ownerId: user?.id || 'anonymous',
      name: state.name,
      designRequirements: state.designRequirements,
      bom: state.bom,
      generatedImages: [],
      messages: JSON.parse(JSON.stringify(this.session.messages.slice(0, messageIndex + 1))),
      createdAt: new Date(),
      lastModified: new Date(),
      cacheIsDirty: true
    };
    
    // Rehydrate dates
    forkedSession.messages.forEach(m => m.timestamp = new Date(m.timestamp));

    this.session = forkedSession;
    this.saveSession();
    return id;
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

  public updateSessionName(name: string) {
    if (!name.trim()) return;
    this.session.name = name.trim();
    this.session.shareSlug = DraftingEngine.generateShareSlug(name);
    this.saveSession();
  }

  public getShareUrl(): string {
    const user = UserService.getCurrentUser();
    const username = user?.username || 'anonymous';
    const slug = this.session.shareSlug || DraftingEngine.generateShareSlug(this.session.name);
    return `/${username}/${slug}`;
  }

  public exportManifest(): string {
    const manifest = {
      ...this.session,
      _exportMetadata: {
        exportedAt: new Date().toISOString(),
        version: "1.0",
        integrityVerified: !this.session.cacheIsDirty
      }
    };
    return JSON.stringify(manifest, null, 2);
  }

  public getSourcingCompletion(): number {
    if (this.session.bom.length === 0) return 100;
    const processedCount = this.session.bom.filter(b => b.sourcing?.online !== undefined).length;
    return Math.round((processedCount / this.session.bom.length) * 100);
  }

  public hasActualLinks(): boolean {
    return this.session.bom.some(b => b.sourcing?.online && b.sourcing.online.length > 0);
  }

  // --- Sub-Assembly Nesting ---

  public setParent(instanceId: string, parentInstanceId: string | null) {
    const entry = this.session.bom.find(b => b.instanceId === instanceId);
    if (!entry) return;
    // Prevent circular nesting
    if (parentInstanceId && parentInstanceId === instanceId) return;
    if (parentInstanceId) {
      // Walk up the parent chain to detect cycles
      let current = parentInstanceId;
      while (current) {
        if (current === instanceId) return; // Cycle detected
        const parent = this.session.bom.find(b => b.instanceId === current);
        current = parent?.parentInstanceId || '';
      }
    }
    this.pushUndo();
    entry.parentInstanceId = parentInstanceId || undefined;
    this.session.cacheIsDirty = true;
    this.saveSession();
  }

  public getChildParts(parentInstanceId: string): BOMEntry[] {
    return this.session.bom.filter(b => b.parentInstanceId === parentInstanceId);
  }

  public getRootParts(): BOMEntry[] {
    return this.session.bom.filter(b => !b.parentInstanceId);
  }

  // --- Undo/Redo ---

  private pushUndo() {
    this.undoStack.push(JSON.stringify(this.session.bom));
    if (this.undoStack.length > DraftingEngine.MAX_UNDO) {
      this.undoStack.shift();
    }
    // Any new action clears the redo stack
    this.redoStack = [];
  }

  public undo(): boolean {
    if (this.undoStack.length === 0) return false;
    this.redoStack.push(JSON.stringify(this.session.bom));
    const previousState = this.undoStack.pop()!;
    this.session.bom = JSON.parse(previousState);
    this.session.cacheIsDirty = true;
    this.saveSession();
    return true;
  }

  public redo(): boolean {
    if (this.redoStack.length === 0) return false;
    this.undoStack.push(JSON.stringify(this.session.bom));
    const nextState = this.redoStack.pop()!;
    this.session.bom = JSON.parse(nextState);
    this.session.cacheIsDirty = true;
    this.saveSession();
    return true;
  }

  public canUndo(): boolean { return this.undoStack.length > 0; }
  public canRedo(): boolean { return this.redoStack.length > 0; }

  // --- CSV Export ---

  public exportCSV(): string {
    const headers = ['Name', 'SKU', 'Category', 'Brand', 'Quantity', 'Unit Price', 'Total', 'Description'];
    const escapeCSV = (val: string) => {
      if (val.includes(',') || val.includes('"') || val.includes('\n')) {
        return '"' + val.replace(/"/g, '""') + '"';
      }
      return val;
    };
    const rows = this.session.bom.map(entry => [
      escapeCSV(entry.part.name),
      escapeCSV(entry.part.sku),
      escapeCSV(entry.part.category),
      escapeCSV(entry.part.brand),
      entry.quantity.toString(),
      entry.part.price.toFixed(2),
      (entry.part.price * entry.quantity).toFixed(2),
      escapeCSV(entry.part.description || '')
    ].join(','));
    return [headers.join(','), ...rows].join('\n');
  }

  // --- Port Compatibility Analysis ---

  public getPortWarnings(): { partA: string; partB: string; portA: string; portB: string; issue: string }[] {
    const warnings: { partA: string; partB: string; portA: string; portB: string; issue: string }[] = [];
    const partsWithPorts = this.session.bom.filter(b => b.part.ports && b.part.ports.length > 0);
    
    for (let i = 0; i < partsWithPorts.length; i++) {
      for (let j = i + 1; j < partsWithPorts.length; j++) {
        const a = partsWithPorts[i];
        const b = partsWithPorts[j];
        for (const portA of a.part.ports) {
          for (const portB of b.part.ports) {
            // Same spec but same gender = can't mate
            if (portA.spec === portB.spec && portA.spec !== '' && portA.gender === portB.gender && portA.gender !== 'NEUTRAL') {
              warnings.push({
                partA: a.part.name,
                partB: b.part.name,
                portA: portA.name,
                portB: portB.name,
                issue: `Both have ${portA.gender} ${portA.spec} — cannot mate`
              });
            }
          }
        }
      }
    }

    // Check for unmatched ports (ports with no compatible mate in the BOM)
    for (const entry of partsWithPorts) {
      for (const port of entry.part.ports) {
        if (port.gender === 'NEUTRAL') continue;
        const oppositeGender = port.gender === 'MALE' ? 'FEMALE' : 'MALE';
        const hasMate = partsWithPorts.some(other =>
          other.instanceId !== entry.instanceId &&
          other.part.ports.some(p => p.spec === port.spec && (p.gender === oppositeGender || p.gender === 'NEUTRAL'))
        );
        if (!hasMate && port.spec) {
          warnings.push({
            partA: entry.part.name,
            partB: '(none)',
            portA: port.name,
            portB: '',
            issue: `No matching ${oppositeGender} ${port.spec} port found in BOM`
          });
        }
      }
    }

    return warnings;
  }
}

let instance: DraftingEngine | null = null;
export const getDraftingEngine = () => {
  if (!instance) instance = new DraftingEngine();
  return instance;
};