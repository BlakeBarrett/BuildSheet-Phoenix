/**
 * VerifiedFactService — Firestore CRUD operations for verified facts.
 *
 * Handles storing, retrieving, and querying verified technical facts with
 * source attribution, confidence scoring, and approval workflow support.
 */

import { Firestore, Query, QuerySnapshot, DocumentData } from 'firebase-admin/firestore';
import { VerifiedFact, FactQuery } from '../types/verifiedFacts.js';
import { nanoid } from 'nanoid';

export class VerifiedFactService {
  private factsCollection: string = 'verified_facts';

  constructor(private db: Firestore) {}

  /**
   * Store a new verified fact in Firestore.
   * @param fact - Fact data without factId, createdAt, or updatedAt
   * @returns The complete VerifiedFact with generated ID and timestamps
   */
  async storeFact(fact: Omit<VerifiedFact, 'factId' | 'createdAt' | 'updatedAt'>): Promise<VerifiedFact> {
    const factId = nanoid();
    const now = new Date();
    const fullFact: VerifiedFact = {
      ...fact,
      factId,
      createdAt: now,
      updatedAt: now
    };
    await this.db.collection(this.factsCollection).doc(factId).set(fullFact);
    return fullFact;
  }

  /**
   * Retrieve a verified fact by its ID.
   * @param factId - The fact ID to look up
   * @returns The VerifiedFact if found, null otherwise
   */
  async getFact(factId: string): Promise<VerifiedFact | null> {
    const snap = await this.db.collection(this.factsCollection).doc(factId).get();
    return snap.exists ? snap.data() as VerifiedFact : null;
  }

  /**
   * Search for verified facts with filtering options.
   * 
   * Note: Firestore's query() chaining is limited - we apply composite
   * filters in-memory after fetching from Firestore to support multiple
   * filter criteria (category, tags, searchTerm, minConfidence).
   * 
   * @param query - Search parameters
   * @returns Array of matching VerifiedFacts (limited to query.limit or 50)
   */
  async searchFacts(query: FactQuery): Promise<VerifiedFact[]> {
    const ref = this.db.collection(this.factsCollection);
    const facts: VerifiedFact[] = [];
    
    // Start with approved facts only
    let q: Query = ref.where('status', '==', 'approved');
    
    // Apply category filter if provided
    if (query.category) {
      q = q.where('category', '==', query.category);
    }
    
    const snapshot: QuerySnapshot<DocumentData> = await q.get();
    
    // Apply additional filters in-memory (tags, searchTerm, minConfidence)
    snapshot.forEach((docSnap) => {
      const fact = docSnap.data() as VerifiedFact;
      
      if (query.minConfidence && fact.confidence < query.minConfidence) return;
      if (query.tags && !query.tags.some(t => fact.tags.includes(t))) return;
      if (query.searchTerm && !fact.statement.toLowerCase().includes(query.searchTerm.toLowerCase())) return;
      
      facts.push(fact);
    });
    
    return facts.slice(0, query.limit || 50);
  }

  /**
   * Update an existing verified fact.
   * @param factId - The fact ID to update
   * @param updates - Fields to update (updatedAt will be set automatically)
   * @returns The updated VerifiedFact, or null if not found
   */
  async updateFact(factId: string, updates: Partial<Omit<VerifiedFact, 'factId' | 'createdAt' | 'updatedAt'>>): Promise<VerifiedFact | null> {
    const existing = await this.getFact(factId);
    if (!existing) return null;
    
    const now = new Date();
    const updatedFact: VerifiedFact = {
      ...existing,
      ...updates,
      factId,
      createdAt: existing.createdAt,
      updatedAt: now
    };
    
    await this.db.collection(this.factsCollection).doc(factId).set(updatedFact);
    return updatedFact;
  }

  /**
   * Delete a verified fact from Firestore.
   * @param factId - The fact ID to delete
   * @returns true if deleted, false if not found
   */
  async deleteFact(factId: string): Promise<boolean> {
    const existing = await this.getFact(factId);
    if (!existing) return false;
    
    await this.db.collection(this.factsCollection).doc(factId).delete();
    return true;
  }
}
