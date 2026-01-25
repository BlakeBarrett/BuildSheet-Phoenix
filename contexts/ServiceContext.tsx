import React, { createContext, useContext, useEffect, useState } from 'react';
import { AIService } from '../services/aiTypes.ts';
import { GeminiService } from '../services/geminiService.ts';
import { MockService } from '../services/mockService.ts';

interface ServiceContextType {
  service: AIService;
  status: 'connecting' | 'online' | 'offline';
  error?: string;
}

const ServiceContext = createContext<ServiceContextType | null>(null);

export const ServiceProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [service, setService] = useState<AIService>(new MockService());
  const [status, setStatus] = useState<'connecting' | 'online' | 'offline'>('connecting');
  const [error, setError] = useState<string | undefined>();

  useEffect(() => {
    const init = () => {
      // 1. Check for API Key
      // @ts-ignore
      const apiKey = process.env.API_KEY;

      if (!apiKey || apiKey.includes('YOUR_API_KEY')) {
        console.warn("ServiceContext: No valid API Key found. Injecting MockService.");
        setService(new MockService());
        setStatus('offline');
        setError("Missing API Key. Running in Simulation Mode.");
        return;
      }

      // 2. Inject GeminiService
      try {
        const gemini = new GeminiService();
        setService(gemini);
        setStatus('online');
      } catch (e: any) {
        console.error("ServiceContext: Failed to inject GeminiService", e);
        setService(new MockService());
        setStatus('offline');
        setError(`Initialization Failed: ${e.message}`);
      }
    };

    init();
  }, []);

  return (
    <ServiceContext.Provider value={{ service, status, error }}>
      {children}
    </ServiceContext.Provider>
  );
};

export const useService = () => {
  const context = useContext(ServiceContext);
  if (!context) {
    throw new Error("useService must be used within a ServiceProvider");
  }
  return context;
};