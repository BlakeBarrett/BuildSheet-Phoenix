import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';

export interface ModelInfo {
  id: string;
  name: string;
  isVision: boolean;
}

// Known vision models pattern matching
const VISION_MODEL_PATTERNS = [
  /llava/i,
  /vision/i,
  /vl/i,
  /paligemma/i,
  /gpt-4v/i,
  /claude-3.*vision/i,
  /gemini.*vision/i,
  /qwen.*vl/i,
  /internvl/i,
  /deepseek.*vl/i,
  /glm-4v/i,
];

// Model name shortener
export function shortenModelName(fullName: string): string {
  // Remove common prefixes and suffixes
  let shortened = fullName
    .replace(/^(openai|google|meta|mistralai|anthropic|microsoft|nvidia|qwen)\//i, '')
    .replace(/-instruct$/i, '')
    .replace(/-chat$/i, '')
    .replace(/-v\d+\.?\d*$/i, '')
    .replace(/-preview$/i, '');
  
  // Convert kebab-case to readable format
  shortened = shortened
    .replace(/-/g, ' ')
    .replace(/(\d+)b/gi, '$1B')
    .replace(/(\d+)m/gi, '$1M');
  
  // Capitalize words
  return shortened.replace(/\b\w/g, c => c.toUpperCase());
}

// Check if model supports vision
export function isVisionModel(modelId: string): boolean {
  return VISION_MODEL_PATTERNS.some(pattern => pattern.test(modelId));
}

class ModelManager {
  private static instance: ModelManager;
  private cachedModels: ModelInfo[] | null = null;
  private lastFetch: number = 0;
  private CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

  private constructor() {}

  static getInstance(): ModelManager {
    if (!ModelManager.instance) {
      ModelManager.instance = new ModelManager();
    }
    return ModelManager.instance;
  }

  // Get cached models or fetch new ones
  async getModels(baseUrl: string, forceRefresh = false): Promise<ModelInfo[]> {
    const now = Date.now();
    
    // Return cached if valid and not forcing refresh
    if (!forceRefresh && this.cachedModels && (now - this.lastFetch) < this.CACHE_DURATION) {
      // Silent refresh in background
      this.fetchModels(baseUrl).catch(() => {});
      return this.cachedModels;
    }

    // Fetch new models
    const models = await this.fetchModels(baseUrl);
    return models;
  }

  private async fetchModels(baseUrl: string): Promise<ModelInfo[]> {
    try {
      const urls = [
        `${baseUrl}/v1/models`,
        `${baseUrl}/models`
      ];

      for (const url of urls) {
        try {
          const response = await fetch(url, {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' },
          });

          if (response.ok) {
            const data = await response.json();
            const models: string[] = data.data?.map((m: any) => m.id) || 
                                     data.models?.map((m: any) => m.name) || 
                                     [];
            
            const modelInfos: ModelInfo[] = models.map((id: string) => ({
              id,
              name: shortenModelName(id),
              isVision: isVisionModel(id)
            }));

            // Update cache
            this.cachedModels = modelInfos;
            this.lastFetch = Date.now();

            return modelInfos;
          }
        } catch (e) {
          continue;
        }
      }
      
      throw new Error('Failed to fetch models from any endpoint');
    } catch (error) {
      // Return cached models if available, even if stale
      if (this.cachedModels) {
        return this.cachedModels;
      }
      throw error;
    }
  }

  // Clear cache
  clearCache() {
    this.cachedModels = null;
    this.lastFetch = 0;
  }
}

export const modelManager = ModelManager.getInstance();

// Hook for model management
export function useModels(baseUrl: string) {
  const { t } = useTranslation();
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refreshModels = useCallback(async (force = false) => {
    setLoading(true);
    setError(null);
    try {
      const fetchedModels = await modelManager.getModels(baseUrl, force);
      setModels(fetchedModels);
    } catch (err: any) {
      setError(err.message || t('modelPicker.error.fetchFailed'));
    } finally {
      setLoading(false);
    }
  }, [baseUrl, t]);

  // Load on mount
  useEffect(() => {
    refreshModels();
  }, [refreshModels]);

  return {
    models,
    loading,
    error,
    refreshModels
  };
}
