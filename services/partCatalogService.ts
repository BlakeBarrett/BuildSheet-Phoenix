import { doc, setDoc, getDoc, collection, query, where, getDocs, Timestamp } from 'firebase/firestore';
import { getFirebaseDb, isFirebaseConfigured } from './firebase';
import { Part, ShoppingOption, GlobalPart } from '../types';

const CATALOG_COLLECTION = 'global_catalog';

/**
 * Registry to act as a global component cache across all users.
 */
export class PartCatalogService {
  /**
   * Attempts to find a fully hydrated part in the global catalog by its name, sku or exact partId.
   */
  async findPartByNameOrSku(queryStr: string): Promise<GlobalPart | null> {
    if (!isFirebaseConfigured()) return null;
    const db = getFirebaseDb();
    if (!db) return null;

    try {
      // Direct lookup by ID
      const docRef = doc(db, CATALOG_COLLECTION, queryStr.toLowerCase());
      const snap = await getDoc(docRef);
      if (snap.exists()) {
        const data = snap.data();
        return this.parseGlobalPart(queryStr, data);
      }

      // Query by name (exact)
      const q = query(
        collection(db, CATALOG_COLLECTION),
        where('part.name', '==', queryStr)
      );
      const docs = await getDocs(q);
      if (!docs.empty) {
        const first = docs.docs[0];
        return this.parseGlobalPart(first.id, first.data());
      }
      return null;
    } catch (e) {
      console.warn('Failed to query global part catalog:', e);
      return null;
    }
  }

  /**
   * Saves a successfully sourced part to the catalog to speed up future generations.
   */
  async saveHydratedPart(part: Part, bestSource?: ShoppingOption): Promise<void> {
    if (!isFirebaseConfigured()) return;
    const db = getFirebaseDb();
    if (!db) return;

    try {
      const docId = (part.sku || part.name).toLowerCase().replace(/[^a-z0-9]/g, '-');
      const payload: any = {
        part,
        bestSource,
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      };
      
      await setDoc(doc(db, CATALOG_COLLECTION, docId), payload, { merge: true });
    } catch (e) {
      console.warn('Failed to save to global part catalog:', e);
    }
  }

  private parseGlobalPart(id: string, data: any): GlobalPart {
    return {
      id,
      part: data.part,
      bestSource: data.bestSource,
      createdAt: data.createdAt?.toDate() || new Date(),
      updatedAt: data.updatedAt?.toDate() || new Date(),
    };
  }
}

export const partCatalogService = new PartCatalogService();
