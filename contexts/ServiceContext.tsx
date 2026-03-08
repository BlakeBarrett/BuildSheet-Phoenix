import React, { createContext, useContext, useEffect, useState } from 'react';
import { AIService } from '../services/aiTypes.ts';
import { MockService } from '../services/mockService.ts';
import { AIManager } from '../services/aiManager.ts';

interface ServiceContextType {
  service: AIService;
  status: 'connecting' | 'online' | 'offline';
  error?: string;
  updateLocalProvider: (provider: any) => void;
}

const ServiceContext = createContext<ServiceContextType | null>(null);

export const ServiceProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [service, setService] = useState<AIService>(new MockService());
  const [status, setStatus] = useState<'connecting' | 'online' | 'offline'>('connecting');
  const [error, setError] = useState<string | undefined>();

  useEffect(() => {
    const init = async () => {
      const { service: aiService, error: serviceError } = await AIManager.createService();
      setService(aiService);
      
      if (serviceError) {
        // If there was an error initializing (e.g. malformed key), we fall back to offline but show error
        setStatus('offline');
        setError(serviceError);
      } else {
        setStatus(aiService.isOffline ? 'offline' : 'online');
      }
    };

    init();
  }, []);

  const updateLocalProvider = (provider: any) => {
    if (provider) {
      localStorage.setItem('localArchitectProvider', JSON.stringify(provider));
    } else {
      localStorage.removeItem('localArchitectProvider');
    }
    // Re-initialize service
    AIManager.createService().then(({ service: aiService, error: serviceError }) => {
      setService(aiService);
      if (serviceError) {
        setStatus('offline');
        setError(serviceError);
      } else {
        setStatus(aiService.isOffline ? 'offline' : 'online');
      }
    });
  };

  return (
    <ServiceContext.Provider value={{ service, status, error, updateLocalProvider }}>
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