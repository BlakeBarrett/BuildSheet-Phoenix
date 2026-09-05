/**
 * Verified Facts — Firestore schema and types for fact verification system.
 *
 * Stores verified technical facts about components, compatibility, requirements,
 * and procurement information with source attribution and confidence scoring.
 */

export interface VerifiedFact {
  factId: string;
  category: 'component-specs' | 'compatibility' | 'requirements' | 'procurement' | 'general';
  statement: string;
  source: 'user-correction' | 'web-verified' | 'documentation' | 'admin';
  confidence: number; // 0-1
  tags: string[];
  createdAt: Date;
  updatedAt: Date;
  createdBy?: string; // userId if user-correction
  approvedBy?: string; // admin userId if reviewed
  status: 'pending' | 'approved' | 'rejected';
}

export interface FactQuery {
  category?: string;
  tags?: string[];
  searchTerm?: string;
  minConfidence?: number;
  limit?: number;
}
