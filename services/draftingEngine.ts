import { Part, BOMEntry, DraftingSession, Gender, PortType, VisualManifest, GeneratedImage } from '../types.ts';
import { HARDWARE_REGISTRY } from '../data/seedData.ts';
import { ActivityLogService } from './activityLogService.ts';
import { UserService } from './userService.ts';

export class DraftingEngine {
  private session: DraftingSession;
  private STORAGE_KEY = 'buildsheet_active_draft';

  constructor() {
    // Try to load from local storage first to prevent data loss on refresh
    let saved: string | null = null;
    try {
        saved = localStorage.getItem(this.STORAGE_KEY);
    } catch (e) {
        console.warn("LocalStorage access failed", e);
    }

    if (saved) {
        try {
            this.session = JSON.parse(saved);
            // Re-hydrate dates
            this.session.createdAt = new Date(this.session.createdAt);
            // Re-hydrate image dates if they exist
            if (this.session.generatedImages) {
                this.session.generatedImages.forEach(img => img.timestamp = new Date(img.timestamp));
            } else {
                this.session.generatedImages = [];
            }
        } catch (e) {
            console.error("Failed to hydrate session", e);
            this.session = this.createNewSession();
        }
    } else {
        this.session = this.createNewSession();
    }
  }

  private createNewSession(): DraftingSession {
    const user = UserService.getCurrentUser();
    return {
      id: Math.random().toString(36).substr(2, 9),
      slug: 'new-build',
      ownerId: user?.id || 'anonymous',
      name: 'Untitled Assembly',
      designRequirements: '',
      bom: [],
      generatedImages: [],
      createdAt: new Date()
    };
  }

  public getSession(): DraftingSession {
    return { ...this.session };
  }

  public updateOwner(ownerId: string) {
    this.session.ownerId = ownerId;
    this.saveSession();
  }

  private saveSession() {
    try {
        localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.session));
        
        // We log the commit, but we don't need to await a DB call anymore
        if (UserService.getCurrentUser()) {
             ActivityLogService.log('DRAFT_COMMITTED', { sessionId: this.session.id });
        }
    } catch (e: any) {
        // Handle LocalStorage Quota Exceeded gracefully
        // We want to keep the in-memory session full (preserve album), but trim persistence if needed.
        if (e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED' || e.code === 22) {
            console.warn("LocalStorage quota exceeded. Trimming persistence history to prevent crash.");
            
            // Shallow copy session, but new array for generatedImages to allow mutation of the copy
            const sessionForStorage = {
                ...this.session,
                generatedImages: [...this.session.generatedImages]
            };

            // Aggressively trim oldest images from the STORAGE copy only
            while (sessionForStorage.generatedImages.length > 0) {
                sessionForStorage.generatedImages.shift(); // Remove oldest
                try {
                    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(sessionForStorage));
                    return; // Saved successfully with reduced history
                } catch (retryError) {
                    continue; // Still too big, keep trimming
                }
            }
            console.error("Critical: Could not save session even after clearing image history.");
        } else {
            console.error("Failed to save session locally", e);
        }
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
    
    // CRITICAL: Do NOT clear generatedImages on re-initialization. 
    // We want to preserve the full design history album across BOM resets.
    if (!this.session.generatedImages) {
        this.session.generatedImages = [];
    }

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
    
    // UNLIMITED HISTORY IN-MEMORY
    // We rely on the saveSession quota handling to manage LocalStorage limits
    // while keeping the active session's album intact for the user.
    this.session.generatedImages.push(img);
    
    ActivityLogService.log('IMAGE_GENERATED', { promptLength: prompt.length });
    this.saveSession();
  }

  public addPart(partId: string, quantity: number = 1): { success: boolean; message: string } {
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
      message: isVirtual ? `Drafted: ${part.name}` : `Added: ${part.name}`
    };
  }

  public removePart(instanceId: string) {
    const part = this.session.bom.find(b => b.instanceId === instanceId);
    this.session.bom = this.session.bom.filter(entry => entry.instanceId !== instanceId);
    ActivityLogService.log('PART_REMOVED', { instanceId, partId: part?.part.id });
    this.saveSession();
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

// Lazy initialization to prevent module evaluation crashes
let instance: DraftingEngine | null = null;
export const getDraftingEngine = () => {
    if (!instance) {
        instance = new DraftingEngine();
    }
    return instance;
};