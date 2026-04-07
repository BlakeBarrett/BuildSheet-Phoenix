import { Part, BOMEntry, DraftingSession, Gender, PortType, VisualManifest, VisualComponent, GeneratedImage, UserMessage, AssemblyPlan } from '../types.ts';
import { ActivityLogService } from './activityLogService.ts';
import { UserService } from './userService.ts';
import { getFirebaseDb } from './firebase.ts';
import { collection, doc, setDoc, getDoc, getDocs, deleteDoc, updateDoc, query, orderBy } from 'firebase/firestore';
import { get, set, del } from 'idb-keyval';

export interface ProjectIndexEntry {
  id: string;
  name: string;
  lastModified: Date;
  preview: string;
  thumbnail?: string; // Latest generated image for the navigator
  archived?: boolean;
  tags?: string[];
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
      advancedValidations: data.advancedValidations,
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
      cacheIsDirty: true,
      archived: false,
      tags: [],
    };
  }

  private saveSession() {
    this.session.lastModified = new Date();
    this.saveSessionToStorage(this.session);
  }

  // --- Firestore helpers ---

  private getFirestoreProjectsCollection() {
    const db = getFirebaseDb();
    const user = UserService.getCurrentUser();
    if (!db || !user || !UserService.isAuthenticated()) return null;
    return collection(db, 'users', user.id, 'projects');
  }

  private async saveSessionToFirestore(session: DraftingSession) {
    const col = this.getFirestoreProjectsCollection();
    if (!col) return;
    try {
      const plain = {
        ...session,
        createdAt: session.createdAt.toISOString(),
        lastModified: session.lastModified.toISOString(),
        generatedImages: [], // large blobs stay in IDB
        cachedAssemblyPlan: session.cachedAssemblyPlan
          ? { ...session.cachedAssemblyPlan, generatedAt: session.cachedAssemblyPlan.generatedAt.toISOString() }
          : undefined,
        messages: session.messages.map(m => ({ ...m, timestamp: m.timestamp.toISOString() })),
        bom: session.bom.map(b => ({
          ...b,
          sourcing: b.sourcing
            ? { ...b.sourcing, lastUpdated: b.sourcing.lastUpdated?.toISOString() }
            : undefined,
        })),
      };
      await setDoc(doc(col, session.id), plain);
    } catch (e) {
      console.error('Firestore save failed', e);
    }
  }

  private async deleteSessionFromFirestore(id: string) {
    const col = this.getFirestoreProjectsCollection();
    if (!col) return;
    try { await deleteDoc(doc(col, id)); } catch (e) { console.error('Firestore delete failed', e); }
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

      // Mirror to Firestore for authenticated users (fire-and-forget).
      if (UserService.isAuthenticated()) {
        this.saveSessionToFirestore(session);
      }
    } catch (e) {
      console.error("Persistence failed", e);
    }
  }

  private updateProjectIndex(session: DraftingSession) {
    try {
      const indexRaw = localStorage.getItem(this.INDEX_KEY);
      let index: any[] = indexRaw ? JSON.parse(indexRaw) : [];
      const existing = index.find(i => i.id === session.id);
      // Clean duplicates
      index = index.filter(i => i.id !== session.id);
      // Thumbnail: use the latest generated image if available
      const latestImage = session.generatedImages.length > 0
        ? session.generatedImages[session.generatedImages.length - 1].url
        : undefined;
      // Keep thumbnail small — take first 200 chars of data URL (enough for a tiny preview)
      const thumbnail = latestImage?.substring(0, 300) || existing?.thumbnail;
      index.unshift({
        id: session.id,
        name: session.name,
        lastModified: session.lastModified,
        preview: session.bom.length > 0 ? `${session.bom.length} Parts` : 'Empty Draft',
        thumbnail,
        archived: session.archived ?? existing?.archived ?? false,
        tags: session.tags ?? existing?.tags ?? [],
      });
      localStorage.setItem(this.INDEX_KEY, JSON.stringify(index));
    } catch (e) {
      console.warn("Failed to update project index", e);
    }
  }

  // getProjectsList moved to below CSV/Import methods (supports includeArchived flag)

  public async loadProject(id: string): Promise<void> {
    let data: any = null;

    // Try localStorage first (fast path)
    const stored = localStorage.getItem(this.SESSION_PREFIX + id);
    if (stored) {
      try { data = JSON.parse(stored); } catch { /* ignore */ }
    }

    // Firestore fallback for authenticated users whose localStorage is cold (new device, quota exceeded)
    if (!data && UserService.isAuthenticated()) {
      const col = this.getFirestoreProjectsCollection();
      if (col) {
        try {
          const d = await getDoc(doc(col, id));
          if (d.exists()) data = d.data();
        } catch (e) { console.error('Firestore project load failed', e); }
      }
    }

    if (data) {
      this.session = this.hydrateSession(data);
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
    // Also remove from Firestore
    this.deleteSessionFromFirestore(id);
    // If we deleted the active one, start fresh
    if (this.session.id === id) {
      this.createNewProject();
    }
  }

  public getSession(): DraftingSession {
    return { ...this.session };
  }

  /**
   * Returns true when a guest user has reached the project limit.
   * Authenticated users have no local cap.
   */
  public isGuestProjectLimitReached(): boolean {
    if (UserService.isAuthenticated()) return false;
    const indexRaw = localStorage.getItem(this.INDEX_KEY);
    if (!indexRaw) return false;
    try {
      const index = JSON.parse(indexRaw);
      return Array.isArray(index) && index.filter((p: any) => !p.archived).length >= 1;
    } catch { return false; }
  }

  public createNewProject() {
    this.session = this.createNewSessionTemplate();
    this.saveSession();
  }

  // --- Firestore-backed project loading ---

  /**
   * Loads all projects from Firestore into localStorage, merging
   * with any existing local entries. Called once after login.
   */
  public async loadProjectsFromFirestore(): Promise<void> {
    const col = this.getFirestoreProjectsCollection();
    if (!col) return;
    try {
      const snap = await getDocs(query(col));
      for (const d of snap.docs) {
        const data = d.data();
        const session = this.hydrateSession(data);
        // Write into localStorage so the rest of the engine works identically
        const key = this.SESSION_PREFIX + session.id;
        const sessionNoImages = { ...session, generatedImages: [] };
        try { localStorage.setItem(key, JSON.stringify(sessionNoImages)); } catch { /* quota */ }
        this.updateProjectIndex(session);
      }
    } catch (e) {
      console.error('Failed to load projects from Firestore', e);
    }
  }

  /**
   * Migrate all localStorage projects to Firestore.
   * Called after a successful login when the user had local guest data.
   * Returns the number of projects migrated.
   */
  public async migrateLocalProjectsToFirestore(): Promise<number> {
    if (!UserService.isAuthenticated()) return 0;
    const col = this.getFirestoreProjectsCollection();
    if (!col) return 0;
    const user = UserService.getCurrentUser();
    if (!user) return 0;

    const indexRaw = localStorage.getItem(this.INDEX_KEY);
    if (!indexRaw) return 0;
    let index: any[];
    try { index = JSON.parse(indexRaw); } catch { return 0; }
    if (!Array.isArray(index) || index.length === 0) return 0;

    let migrated = 0;
    for (const entry of index) {
      const stored = localStorage.getItem(this.SESSION_PREFIX + entry.id);
      if (!stored) continue;
      try {
        const session = this.hydrateSession(JSON.parse(stored));
        // Re-assign ownership to the authenticated user
        session.ownerId = user.id;
        await this.saveSessionToFirestore(session);
        migrated++;
      } catch (e) {
        console.error('Migration failed for project', entry.id, e);
      }
    }
    return migrated;
  }

  /**
   * Clear all guest projects from localStorage after migration.
   */
  public clearLocalProjects() {
    const indexRaw = localStorage.getItem(this.INDEX_KEY);
    if (!indexRaw) return;
    try {
      const index = JSON.parse(indexRaw);
      for (const entry of index) {
        localStorage.removeItem(this.SESSION_PREFIX + entry.id);
        del(this.SESSION_PREFIX + entry.id + '_images').catch(() => {});
      }
    } catch { /* ignore */ }
    localStorage.removeItem(this.INDEX_KEY);
    localStorage.removeItem(this.ACTIVE_ID_KEY);
  }

  public async addPart(partId: string, name?: string, category?: string, quantity: number = 1) {
    this.pushUndo();

    let part: Part | null = null;
    try {
      const { partCatalogService } = await import('./partCatalogService');
      const globalPart = await partCatalogService.findPartByNameOrSku(name || partId);
      if (globalPart) {
        part = { ...globalPart.part };
      }
    } catch (e) {
      console.warn('Failed retrieving from global catalog', e);
    }

    if (!part) {
      part = {
        id: partId,
        sku: `DRAFT-${partId.toUpperCase()}`,
        name: name || partId.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' '),
        category: category || 'Component',
        brand: 'TBD',
        price: 0,
        description: `${category || 'Component'} added by architect.`,
        ports: []
      };
    }

    const existingEntry = this.session.bom.find(b => b.part.id === part?.id);
    if (existingEntry) {
      this.updatePartQuantity(existingEntry.instanceId, existingEntry.quantity + quantity);
    } else {
      const entry: BOMEntry = {
        instanceId: `${part?.id}-${Math.random().toString(36).substr(2, 5)}`,
        part: { ...part! },
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

  public setAdvancedValidations(validations: DraftingSession['advancedValidations']) {
    this.session.advancedValidations = validations;
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
            if (typeof opt.price === 'number' && opt.price > 0) return opt.price;
            
            // Try to extract from string price
            if (typeof opt.price === 'string') {
              const priceMatch = opt.price.match(/(?:\$|)\s?(\d+[\d,.]*)/);
              if (priceMatch) {
                const val = parseFloat(priceMatch[1].replace(/,/g, ''));
                if (!isNaN(val) && val > 0) return val;
              }
            }

            // Fallback to title ONLY if it specifically contains a $ sign
            if (opt.title && typeof opt.title === 'string' && opt.title.includes('$')) {
              const titleMatch = opt.title.match(/\$\s*(\d+[\d,.]*)/);
              if (titleMatch) {
                const val = parseFloat(titleMatch[1].replace(/,/g, ''));
                if (!isNaN(val) && val > 0) return val;
              }
            }
            
            return null;
          })
          .filter((p: number | null) => p !== null && p > 0);

        if (prices.length > 0) {
          entry.part.price = Math.min(...prices);
        } else if (entry.part.price === 0) {
          entry.part.price = 14.99;
        }

          // Trigger saving this fully hydrated and sourced part to the global catalog
          import('./partCatalogService').then(module => {
            module.partCatalogService.saveHydratedPart(entry.part, onlineData[0]);
          }).catch(console.warn);

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

  public setVisualManifest(manifest: VisualManifest | undefined) {
    this.session.visualManifest = manifest;
    this.saveSession();
  }

  public generateFallbackManifest(): VisualManifest | undefined {
    if (this.session.bom.length === 0) return undefined;

    const palette = ['#818CF8', '#34D399', '#F59E0B', '#F87171', '#60A5FA', '#A78BFA', '#FB923C', '#2DD4BF'];
    const components = this.session.bom.map((entry, i): VisualComponent => ({
      partId: entry.part.id,
      shape: entry.part.category.toLowerCase().includes('motor') || entry.part.category.toLowerCase().includes('engine')
        ? 'cylinder'
        : entry.part.category.toLowerCase().includes('bearing') || entry.part.category.toLowerCase().includes('ball')
          ? 'sphere'
          : 'box',
      dims: [
        Math.max(80, 60 + entry.part.name.length * 3),
        60,
        40
      ],
      color: palette[i % palette.length],
      label: entry.part.name,
    }));

    return {
      stackAxis: components.length > 5 ? 'y' : 'x',
      components
    };
  }

  public getShareUrl(): string {
    // Encode the project as a compressed base64 query param so shared links actually work
    try {
      const manifest = this.exportManifest();
      const compressed = btoa(encodeURIComponent(manifest));
      return `/?shared=${compressed}`;
    } catch {
      // Fallback for very large projects
      const user = UserService.getCurrentUser();
      const username = user?.username || 'anonymous';
      const slug = this.session.shareSlug || DraftingEngine.generateShareSlug(this.session.name);
      return `/${username}/${slug}`;
    }
  }

  public static loadFromShareParam(param: string): DraftingSession | null {
    try {
      const json = decodeURIComponent(atob(param));
      const parsed = JSON.parse(json);
      return parsed as DraftingSession;
    } catch {
      return null;
    }
  }

  // --- Tag Management ---

  /**
   * Patches metadata fields (archived, tags) across all persistence layers:
   * 1. The stored session blob in localStorage (so the session document is up-to-date)
   * 2. The project index in localStorage (so the navigator reflects changes immediately)
   * 3. The in-memory session if it is the active project
   * 4. Firestore (fire-and-forget updateDoc so authenticated users see changes on other devices)
   */
  private patchProjectMetadata(id: string, fields: Partial<Pick<DraftingSession, 'archived' | 'tags'>>) {
    // 1. Patch the stored session blob (without touching lastModified)
    const sessionKey = this.SESSION_PREFIX + id;
    try {
      const stored = localStorage.getItem(sessionKey);
      if (stored) {
        const parsed = JSON.parse(stored);
        localStorage.setItem(sessionKey, JSON.stringify({ ...parsed, ...fields }));
      }
    } catch { /* ignore quota/parse errors */ }

    // 2. Patch the project index entry
    try {
      const indexRaw = localStorage.getItem(this.INDEX_KEY);
      if (indexRaw) {
        const index: any[] = JSON.parse(indexRaw);
        const entry = index.find(i => i.id === id);
        if (entry) {
          Object.assign(entry, fields);
          localStorage.setItem(this.INDEX_KEY, JSON.stringify(index));
        }
      }
    } catch { /* ignore */ }

    // 3. Patch in-memory session if this is the active project
    if (this.session.id === id) {
      Object.assign(this.session, fields);
    }

    // 4. Fire-and-forget Firestore patch for authenticated users
    if (UserService.isAuthenticated()) {
      const col = this.getFirestoreProjectsCollection();
      if (col) {
        updateDoc(doc(col, id), fields).catch(e =>
          console.error('Firestore metadata patch failed', e)
        );
      }
    }
  }

  public setProjectTags(projectId: string, tags: string[]) {
    this.patchProjectMetadata(projectId, { tags });
  }

  public getProjectTags(projectId: string): string[] {
    try {
      const indexRaw = localStorage.getItem(this.INDEX_KEY);
      if (!indexRaw) return [];
      const index: any[] = JSON.parse(indexRaw);
      const entry = index.find(i => i.id === projectId);
      return entry?.tags || [];
    } catch {
      return [];
    }
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

  public importManifest(json: string): boolean {
    try {
      const parsed = JSON.parse(json);
      // Give it a new ID so it doesn't overwrite an existing project
      const imported = this.hydrateSession({
        ...parsed,
        id: crypto.randomUUID(),
        name: parsed.name ? `${parsed.name} (Shared)` : 'Imported Project',
        lastModified: new Date(),
      });
      this.session = imported;
      this.saveSession();
      return true;
    } catch {
      return false;
    }
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
    const disclaimer = '# Generated by BuildSheet AI — verify all specifications before procurement or fabrication.';
    return [disclaimer, headers.join(','), ...rows].join('\n');
  }

  // --- CSV Import ---

  private static parseCSVRow(line: string): string[] {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQuotes) {
        if (ch === '"' && line[i + 1] === '"') {
          current += '"';
          i++;
        } else if (ch === '"') {
          inQuotes = false;
        } else {
          current += ch;
        }
      } else {
        if (ch === '"') {
          inQuotes = true;
        } else if (ch === ',') {
          result.push(current.trim());
          current = '';
        } else {
          current += ch;
        }
      }
    }
    result.push(current.trim());
    return result;
  }

  public importCSV(csvText: string, columnMap?: { name?: number; sku?: number; category?: number; brand?: number; quantity?: number; price?: number; description?: number }): number {
    const lines = csvText.split(/\r?\n/).filter(l => l.trim());
    if (lines.length < 2) return 0;

    const headerRow = DraftingEngine.parseCSVRow(lines[0]);
    const headerLower = headerRow.map(h => h.toLowerCase().replace(/[^a-z]/g, ''));

    // Auto-detect column indices if no explicit mapping provided
    const map = columnMap || {};
    if (map.name === undefined) map.name = headerLower.findIndex(h => h.includes('name') || h.includes('component') || h.includes('part'));
    if (map.sku === undefined) map.sku = headerLower.findIndex(h => h.includes('sku') || h.includes('partnum') || h.includes('partnumber') || h.includes('mpn'));
    if (map.category === undefined) map.category = headerLower.findIndex(h => h.includes('category') || h.includes('type') || h.includes('group'));
    if (map.brand === undefined) map.brand = headerLower.findIndex(h => h.includes('brand') || h.includes('manufacturer') || h.includes('mfr'));
    if (map.quantity === undefined) map.quantity = headerLower.findIndex(h => h.includes('qty') || h.includes('quantity') || h.includes('count'));
    if (map.price === undefined) map.price = headerLower.findIndex(h => h.includes('price') || h.includes('unitprice') || h.includes('cost'));
    if (map.description === undefined) map.description = headerLower.findIndex(h => h.includes('description') || h.includes('desc') || h.includes('notes'));

    // Require at least a name column
    if (map.name === undefined || map.name < 0) {
      // Fallback: first non-empty column
      map.name = 0;
    }

    this.pushUndo();
    let imported = 0;

    for (let i = 1; i < lines.length; i++) {
      const cols = DraftingEngine.parseCSVRow(lines[i]);
      const name = cols[map.name!] || '';
      if (!name) continue;

      const sku = (map.sku !== undefined && map.sku >= 0 ? cols[map.sku] : '') || '';
      const category = (map.category !== undefined && map.category >= 0 ? cols[map.category] : '') || 'Component';
      const brand = (map.brand !== undefined && map.brand >= 0 ? cols[map.brand] : '') || 'TBD';
      const quantityStr = map.quantity !== undefined && map.quantity >= 0 ? cols[map.quantity] : '1';
      const quantity = Math.max(1, parseInt(quantityStr, 10) || 1);
      const priceStr = map.price !== undefined && map.price >= 0 ? (cols[map.price] || '0') : '0';
      const price = Math.max(0, parseFloat(priceStr.replace(/[^0-9.]/g, '')) || 0);
      const description = (map.description !== undefined && map.description >= 0 ? cols[map.description] : '') || '';

      const partId = sku || `imported-${name.toLowerCase().replace(/[^a-z0-9]/g, '-').substring(0, 32)}-${Math.random().toString(36).substr(2, 4)}`;

      const part: Part = {
        id: partId,
        sku: sku || `IMPORT-${partId.toUpperCase().substring(0, 12)}`,
        name,
        category,
        brand,
        price,
        description,
        ports: []
      };

      const entry: BOMEntry = {
        instanceId: `${part.id}-${Math.random().toString(36).substr(2, 5)}`,
        part,
        quantity,
        isCompatible: true
      };

      this.session.bom.push(entry);
      imported++;
    }

    if (imported > 0) {
      this.session.cacheIsDirty = true;
      this.saveSession();
    }
    return imported;
  }

  // --- Paste-in BOM Import ---

  public importPastedText(text: string): number {
    const lines = text.split(/\r?\n/).filter(l => l.trim());
    if (lines.length === 0) return 0;

    // Detect if it's actually CSV (has commas and a header-like first line)
    const commaCount = (lines[0].match(/,/g) || []).length;
    if (commaCount >= 2) {
      return this.importCSV(text);
    }

    // Detect tab-separated
    const tabCount = (lines[0].match(/\t/g) || []).length;
    if (tabCount >= 1) {
      return this.importCSV(text.replace(/\t/g, ','));
    }

    this.pushUndo();
    let imported = 0;

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      // Try to parse common patterns:
      // "2x Widget Assembly" or "Widget Assembly x3" or "Widget Assembly (2)" or just "Widget Assembly"
      let name = trimmed;
      let quantity = 1;

      // Pattern: "2x Name" or "2 x Name"
      const prefixMatch = trimmed.match(/^(\d+)\s*x\s+(.+)$/i);
      if (prefixMatch) {
        quantity = parseInt(prefixMatch[1], 10) || 1;
        name = prefixMatch[2].trim();
      } else {
        // Pattern: "Name x2" or "Name x 2"
        const suffixMatch = trimmed.match(/^(.+?)\s*x\s*(\d+)$/i);
        if (suffixMatch) {
          name = suffixMatch[1].trim();
          quantity = parseInt(suffixMatch[2], 10) || 1;
        } else {
          // Pattern: "Name (2)" or "Name [2]"
          const parenMatch = trimmed.match(/^(.+?)\s*[\(\[](\d+)[\)\]]$/);
          if (parenMatch) {
            name = parenMatch[1].trim();
            quantity = parseInt(parenMatch[2], 10) || 1;
          }
        }
      }

      // Strip leading bullets, dashes, numbers with dots/parens
      name = name.replace(/^[\-\*•]\s*/, '').replace(/^\d+[\.\)]\s*/, '').trim();
      if (!name) continue;

      const partId = `pasted-${name.toLowerCase().replace(/[^a-z0-9]/g, '-').substring(0, 32)}-${Math.random().toString(36).substr(2, 4)}`;
      const part: Part = {
        id: partId,
        sku: `DRAFT-${partId.toUpperCase().substring(0, 12)}`,
        name,
        category: 'Component',
        brand: 'TBD',
        price: 0,
        description: 'Imported from pasted text.',
        ports: []
      };

      const entry: BOMEntry = {
        instanceId: `${part.id}-${Math.random().toString(36).substr(2, 5)}`,
        part,
        quantity,
        isCompatible: true
      };

      this.session.bom.push(entry);
      imported++;
    }

    if (imported > 0) {
      this.session.cacheIsDirty = true;
      this.saveSession();
    }
    return imported;
  }

  // --- Project Duplication ---

  public duplicateProject(sourceId?: string): string {
    const id = sourceId || this.session.id;
    let sourceSession: DraftingSession;

    if (id === this.session.id) {
      sourceSession = { ...this.session };
    } else {
      const stored = localStorage.getItem(this.SESSION_PREFIX + id);
      if (!stored) return this.session.id;
      sourceSession = this.hydrateSession(JSON.parse(stored));
    }

    const newId = Math.random().toString(36).substr(2, 9);
    const user = UserService.getCurrentUser();

    const newSession: DraftingSession = {
      ...sourceSession,
      id: newId,
      slug: `build-${newId.substr(0, 4)}`,
      ownerId: user?.id || 'anonymous',
      name: sourceSession.name + ' (Copy)',
      bom: JSON.parse(JSON.stringify(sourceSession.bom)),
      messages: JSON.parse(JSON.stringify(sourceSession.messages)),
      generatedImages: [], // Don't duplicate large image blobs
      createdAt: new Date(),
      lastModified: new Date(),
      cacheIsDirty: true,
      cachedAuditResult: undefined,
      cachedAssemblyPlan: undefined
    };

    newSession.messages.forEach(m => m.timestamp = new Date(m.timestamp));
    this.saveSessionToStorage(newSession);
    return newId;
  }

  // --- Project Archiving ---

  public archiveProject(id: string) {
    this.patchProjectMetadata(id, { archived: true });
  }

  public unarchiveProject(id: string) {
    this.patchProjectMetadata(id, { archived: false });
  }

  public getProjectsList(includeArchived = false): ProjectIndexEntry[] {
    const indexRaw = localStorage.getItem(this.INDEX_KEY);
    if (!indexRaw) return [];
    try {
      const parsed = JSON.parse(indexRaw);
      return parsed
        .filter((p: any) => includeArchived || !p.archived)
        .map((p: any) => ({
          ...p,
          lastModified: new Date(p.lastModified)
        }));
    } catch (e) {
      return [];
    }
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