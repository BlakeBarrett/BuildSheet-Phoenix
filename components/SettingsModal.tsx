import React, { useState, useEffect } from 'react';
import { Button, IconButton } from './Material3UI.tsx';
import { useService } from '../contexts/ServiceContext.tsx';
import { LocalModelProvider } from '../services/localAiService.ts';

interface SettingsModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose }) => {
    const { updateLocalProvider } = useService();
    const [models, setModels] = useState<LocalModelProvider[]>([]);
    const [loading, setLoading] = useState(false);
    const [selectedModelId, setSelectedModelId] = useState<string>('');
    const [serverAddress, setServerAddress] = useState<string>('192.168.1.41');

    useEffect(() => {
        if (isOpen) {
            let currentAddress = '192.168.1.41';
            const savedAddress = localStorage.getItem('localArchitectAddress');
            if (savedAddress) {
                setServerAddress(savedAddress);
                currentAddress = savedAddress;
            }
            fetchModels(currentAddress);
            const saved = localStorage.getItem('localArchitectProvider');
            if (saved) {
                try {
                    const parsed = JSON.parse(saved);
                    setSelectedModelId(parsed.id);
                } catch (e) { }
            }
        }
    }, [isOpen]);

    const fetchModels = async (addressToUse = serverAddress) => {
        setLoading(true);
        const fetchedModels: LocalModelProvider[] = [];

        // Fetch LM Studio Models
        try {
            const res = await fetch(`http://${addressToUse}:1234/v1/models`);
            if (res.ok) {
                const data = await res.json();
                if (data.data) {
                    data.data.forEach((m: any) => {
                        fetchedModels.push({
                            id: m.id,
                            name: `[LM Studio] ${m.id}`,
                            endpointUrl: `http://${addressToUse}:1234/v1/chat/completions`,
                            type: 'openai'
                        });
                    });
                }
            }
        } catch (e) {
            console.error('Failed to fetch LM Studio models', e);
        }

        // Fetch Ollama Models
        try {
            const res = await fetch(`http://${addressToUse}:11434/api/tags`);
            if (res.ok) {
                const data = await res.json();
                if (data.models) {
                    data.models.forEach((m: any) => {
                        fetchedModels.push({
                            id: m.name,
                            name: `[Ollama] ${m.name}`,
                            endpointUrl: `http://${addressToUse}:11434/v1/chat/completions`,
                            type: 'ollama'
                        });
                    });
                }
            }
        } catch (e) {
            console.error('Failed to fetch Ollama models', e);
        }

        setModels(fetchedModels);
        setLoading(false);
    };

    const handleSave = () => {
        localStorage.setItem('localArchitectAddress', serverAddress);
        if (!selectedModelId) {
            updateLocalProvider(null);
        } else {
            const provider = models.find(m => m.id === selectedModelId);
            if (provider) {
                updateLocalProvider(provider);
            }
        }
        onClose();
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[200] bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white rounded-[32px] shadow-2xl max-w-md w-full overflow-hidden animate-in zoom-in-95 duration-200">
                <div className="p-6 pb-2 flex justify-between items-center border-b border-gray-100">
                    <h3 className="text-xl font-bold text-slate-800 tracking-tight">AI Settings</h3>
                    <IconButton icon="close" onClick={onClose} title="Close" />
                </div>
                
                <div className="p-6 space-y-4">
                    <div>
                        <label className="block text-sm font-bold text-slate-700 mb-1">Server Address</label>
                        <p className="text-xs text-slate-500 mb-2">
                            The IP address or hostname of your AI server.
                        </p>
                        <div className="flex gap-2 mb-4">
                            <input 
                                type="text" 
                                value={serverAddress}
                                onChange={(e) => setServerAddress(e.target.value)}
                                className="flex-1 p-3 bg-slate-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                                placeholder="192.168.1.41"
                            />
                            <Button variant="tonal" onClick={() => fetchModels(serverAddress)} disabled={loading}>
                                Scan
                            </Button>
                        </div>

                        <label className="block text-sm font-bold text-slate-700 mb-2">Local Architect Model</label>
                        <p className="text-xs text-slate-500 mb-3">
                            Override the default Architect role by pointing to a local model on your network.
                        </p>
                        
                        {loading ? (
                            <div className="text-center py-4 text-sm text-slate-500 flex items-center justify-center gap-2">
                                <span className="material-symbols-rounded animate-spin">progress_activity</span>
                                Scanning local network...
                            </div>
                        ) : (
                            <select 
                                value={selectedModelId}
                                onChange={(e) => setSelectedModelId(e.target.value)}
                                className="w-full p-3 bg-slate-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                            >
                                <option value="">Default (Gemini Cloud API)</option>
                                {models.map(m => (
                                    <option key={m.id} value={m.id}>{m.name}</option>
                                ))}
                            </select>
                        )}
                        
                        {!loading && models.length === 0 && (
                            <p className="text-xs text-amber-600 mt-2">
                                No local models found. Make sure LM Studio or Ollama is running on {serverAddress} and CORS is enabled.
                            </p>
                        )}
                    </div>
                </div>

                <div className="p-6 border-t border-gray-100 flex justify-end gap-3 bg-slate-50">
                    <Button variant="ghost" onClick={() => fetchModels(serverAddress)}>Refresh Models</Button>
                    <Button variant="primary" onClick={handleSave}>Save Changes</Button>
                </div>
            </div>
        </div>
    );
};
