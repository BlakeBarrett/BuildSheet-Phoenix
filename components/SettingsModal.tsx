import React, { useState, useEffect } from 'react';
import { Button, IconButton } from './Material3UI.tsx';
import { useService } from '../contexts/ServiceContext.tsx';
import { LocalModelProvider } from '../services/localAiService.ts';
import { clearAllUserData } from './CookieConsent.tsx';
import { useTier } from '../hooks/useTier.tsx';
import { useTranslation } from 'react-i18next';

interface SettingsModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose }) => {
    const { updateLocalProvider } = useService();
    const { tier } = useTier();
    const isEnterprise = tier === 'enterprise';
    const { t } = useTranslation();
    const [models, setModels] = useState<LocalModelProvider[]>([]);
    const [loading, setLoading] = useState(false);
    const [selectedModelId, setSelectedModelId] = useState<string>('');
    const [selectedAuditModelId, setSelectedAuditModelId] = useState<string>('');
    const [selectedPlanModelId, setSelectedPlanModelId] = useState<string>('');
    const [selectedCadModelId, setSelectedCadModelId] = useState<string>('');
    const [selectedUtilityModelId, setSelectedUtilityModelId] = useState<string>('');
    const [searchApiKey, setSearchApiKey] = useState<string>('');
    const [selectedSearchReasoningId, setSelectedSearchReasoningId] = useState<string>('');
    const [serverAddress, setServerAddress] = useState<string>('192.168.1.41');
    const [temperature, setTemperature] = useState<number>(0.7);

    useEffect(() => {
        if (isOpen) {
            const savedTemp = localStorage.getItem('aiTemperature');
            if (savedTemp) setTemperature(parseFloat(savedTemp));
            // @ts-ignore
            const envUrl = (typeof window !== 'undefined' && window._env_ && window._env_.LOCAL_ARCHITECT_URL) || (typeof process !== 'undefined' && process.env && process.env.LOCAL_ARCHITECT_URL);
            // @ts-ignore
            const envModel = (typeof window !== 'undefined' && window._env_ && window._env_.LOCAL_ARCHITECT_MODEL) || (typeof process !== 'undefined' && process.env && process.env.LOCAL_ARCHITECT_MODEL);

            let currentAddress = '192.168.1.41';
            if (envUrl) {
                try {
                    const parsedUrl = new URL(envUrl);
                    currentAddress = parsedUrl.hostname;
                } catch(e) {}
            }

            const savedAddress = localStorage.getItem('localArchitectAddress');
            if (savedAddress) {
                setServerAddress(savedAddress);
                currentAddress = savedAddress;
            } else {
                setServerAddress(currentAddress);
            }

            if (isEnterprise) fetchModels(currentAddress);
            const saved = localStorage.getItem('localArchitectProvider');
            if (saved) {
                try {
                    const parsed = JSON.parse(saved);
                    setSelectedModelId(parsed.id);
                } catch (e) { }
            } else if (envModel) {
                setSelectedModelId(envModel);
            }
            const savedAudit = localStorage.getItem('localAuditProvider');
            if (savedAudit) {
                try {
                    setSelectedAuditModelId(JSON.parse(savedAudit).id);
                } catch (e) { }
            }
            const savedPlan = localStorage.getItem('localPlanProvider');
            if (savedPlan) {
                try {
                    setSelectedPlanModelId(JSON.parse(savedPlan).id);
                } catch (e) { }
            }
            const savedCad = localStorage.getItem('localCadProvider');
            if (savedCad) {
                try {
                    setSelectedCadModelId(JSON.parse(savedCad).id);
                } catch (e) { }
            }
            const savedUtility = localStorage.getItem('localUtilityProvider');
            if (savedUtility) {
                try {
                    setSelectedUtilityModelId(JSON.parse(savedUtility).id);
                } catch (e) { }
            }
            const savedSearchKey = localStorage.getItem('searchApiKey');
            if (savedSearchKey) setSearchApiKey(savedSearchKey);
            const savedSearchBackend = localStorage.getItem('procurementVerificationBackend');
            const savedSearchProvider = localStorage.getItem('localProcurementProvider');
            if (savedSearchBackend === 'local' && savedSearchProvider) {
                try {
                    setSelectedSearchReasoningId(JSON.parse(savedSearchProvider).id);
                } catch (e) { }
            } else {
                setSelectedSearchReasoningId('');
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
        localStorage.setItem('aiTemperature', String(temperature));
        if (isEnterprise) {
            localStorage.setItem('localArchitectAddress', serverAddress);
            // Save audit model
            if (selectedAuditModelId) {
                const auditProvider = models.find(m => m.id === selectedAuditModelId);
                if (auditProvider) {
                    localStorage.setItem('localAuditProvider', JSON.stringify(auditProvider));
                }
            } else {
                localStorage.removeItem('localAuditProvider');
            }
            // Save plan model
            if (selectedPlanModelId) {
                const planProvider = models.find(m => m.id === selectedPlanModelId);
                if (planProvider) {
                    localStorage.setItem('localPlanProvider', JSON.stringify(planProvider));
                }
            } else {
                localStorage.removeItem('localPlanProvider');
            }
            // Save CAD model
            if (selectedCadModelId) {
                const cadProvider = models.find(m => m.id === selectedCadModelId);
                if (cadProvider) {
                    localStorage.setItem('localCadProvider', JSON.stringify(cadProvider));
                }
            } else {
                localStorage.removeItem('localCadProvider');
            }
            // Save utility model
            if (selectedUtilityModelId) {
                const utilityProvider = models.find(m => m.id === selectedUtilityModelId);
                if (utilityProvider) {
                    localStorage.setItem('localUtilityProvider', JSON.stringify(utilityProvider));
                }
            } else {
                localStorage.removeItem('localUtilityProvider');
            }
            // Save search API key
            if (searchApiKey.trim()) {
                localStorage.setItem('searchApiKey', searchApiKey.trim());
            } else {
                localStorage.removeItem('searchApiKey');
            }
            // Save search reasoning backend
            if (selectedSearchReasoningId) {
                const searchProvider = models.find(m => m.id === selectedSearchReasoningId);
                if (searchProvider) {
                    localStorage.setItem('localProcurementProvider', JSON.stringify(searchProvider));
                    localStorage.setItem('procurementVerificationBackend', 'local');
                }
            } else {
                localStorage.removeItem('localProcurementProvider');
                localStorage.setItem('procurementVerificationBackend', 'cloud');
            }

            if (!selectedModelId) {
                updateLocalProvider(null);
            } else {
                const provider = models.find(m => m.id === selectedModelId);
                if (provider) {
                    updateLocalProvider(provider);
                }
            }
        }
        onClose();
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[300] bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="settings-title">
            <div className="bg-white rounded-[32px] shadow-2xl max-w-md w-full overflow-hidden animate-in zoom-in-95 duration-200 max-h-[90vh] flex flex-col">
                <div className="p-6 pb-2 flex justify-between items-center border-b border-gray-100">
                    <h3 id="settings-title" className="text-xl font-bold text-slate-800 tracking-tight">{t('settings.title')}</h3>
                    <IconButton icon="close" onClick={onClose} title={t('modal.close')} />
                </div>
                
                <div className="p-6 space-y-4 overflow-y-auto flex-1">
                    {/* Temperature slider — available to all tiers */}
                    <div>
                        <label htmlFor="ai-temperature" className="block text-sm font-bold text-slate-700 mb-1">{t('settings.temperature')}</label>
                        <p className="text-xs text-slate-600 mb-3">
                            Controls AI creativity. Lower values produce more focused, deterministic responses. Higher values are more creative and varied.
                        </p>
                        <div className="flex items-center gap-3">
                            <span className="text-xs text-slate-500 w-14">{t('settings.precise')}</span>
                            <input
                                id="ai-temperature"
                                type="range"
                                min="0"
                                max="2"
                                step="0.1"
                                value={temperature}
                                onChange={(e) => setTemperature(parseFloat(e.target.value))}
                                className="flex-1 h-2 bg-slate-200 rounded-full appearance-none cursor-pointer accent-indigo-600"
                            />
                            <span className="text-xs text-slate-500 w-14 text-right">{t('settings.creative')}</span>
                            <span className="text-sm font-mono font-bold text-slate-700 w-10 text-center bg-slate-100 rounded-lg py-1">{temperature.toFixed(1)}</span>
                        </div>
                    </div>

                    {/* Model selection — Enterprise only */}
                    <div className={!isEnterprise ? 'opacity-50 pointer-events-none' : ''}>
                        {!isEnterprise && (
                            <div className="flex items-center gap-2 mb-3 p-2.5 bg-amber-50 rounded-xl">
                                <span className="material-symbols-rounded text-amber-600 text-[18px]" aria-hidden="true">lock</span>
                                <span className="text-xs font-medium text-amber-700">{t('settings.enterpriseRequired')}</span>
                            </div>
                        )}
                        <label htmlFor="server-address" className="block text-sm font-bold text-slate-700 mb-1">{t('settings.serverAddress')}</label>
                        <p className="text-xs text-slate-600 mb-2">
                            The IP address or hostname of your AI server.
                        </p>
                        <div className="flex gap-2 mb-4">
                            <input 
                                id="server-address"
                                type="text" 
                                value={serverAddress}
                                onChange={(e) => setServerAddress(e.target.value)}
                                className="flex-1 p-3 bg-slate-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                                placeholder={t('settings.ipPlaceholder')}
                            />
                            <Button variant="tonal" onClick={() => fetchModels(serverAddress)} disabled={loading}>
                                {t('settings.scan')}
                            </Button>
                        </div>

                        <label htmlFor="local-model" className="block text-sm font-bold text-slate-700 mb-2">{t('settings.architectModel')}</label>
                        <p className="text-xs text-slate-600 mb-3">
                            Override the default Architect role by pointing to a local model on your network.
                        </p>
                        
                        {loading ? (
                            <div className="text-center py-4 text-sm text-slate-500 flex items-center justify-center gap-2">
                                <span className="material-symbols-rounded animate-spin">progress_activity</span>
                                {t('settings.scanning')}
                            </div>
                        ) : (
                            <select 
                                id="local-model"
                                value={selectedModelId}
                                onChange={(e) => setSelectedModelId(e.target.value)}
                                className="w-full p-3 bg-slate-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                            >
                                <option value="">{t('settings.defaultArchitect')}</option>
                                {models.map(m => (
                                    <option key={m.id} value={m.id}>{m.name}</option>
                                ))}
                            </select>
                        )}
                        
                        {!loading && models.length === 0 && (
                            <p className="text-xs text-amber-600 mt-2">
                                {t('settings.noModelsFound', { address: serverAddress })}
                            </p>
                        )}

                        {models.length > 0 && (
                            <>
                                <div className="mt-5 pt-4 border-t border-gray-100">
                                    <label htmlFor="audit-model" className="block text-sm font-bold text-slate-700 mb-2">{t('settings.validationModel')}</label>
                                    <p className="text-xs text-slate-600 mb-3">
                                        Override the default model for the Validation Audit (design feasibility check).
                                    </p>
                                    <select
                                        id="audit-model"
                                        value={selectedAuditModelId}
                                        onChange={(e) => setSelectedAuditModelId(e.target.value)}
                                        className="w-full p-3 bg-slate-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                                    >
                                        <option value="">{t('settings.defaultArchitect')}</option>
                                        {models.map(m => (
                                            <option key={m.id} value={m.id}>{m.name}</option>
                                        ))}
                                    </select>
                                </div>

                                <div className="mt-5 pt-4 border-t border-gray-100">
                                    <label htmlFor="plan-model" className="block text-sm font-bold text-slate-700 mb-2">{t('settings.planModel')}</label>
                                    <p className="text-xs text-slate-600 mb-3">
                                        Override the default model for the Assembly Plan generation.
                                    </p>
                                    <select
                                        id="plan-model"
                                        value={selectedPlanModelId}
                                        onChange={(e) => setSelectedPlanModelId(e.target.value)}
                                        className="w-full p-3 bg-slate-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                                    >
                                        <option value="">{t('settings.defaultArchitect')}</option>
                                        {models.map(m => (
                                            <option key={m.id} value={m.id}>{m.name}</option>
                                        ))}
                                    </select>
                                </div>

                                <div className="mt-5 pt-4 border-t border-gray-100">
                                    <label htmlFor="cad-model" className="block text-sm font-bold text-slate-700 mb-2">{t('settings.cadModel')}</label>
                                    <p className="text-xs text-slate-600 mb-3">
                                        Model used for generating OpenSCAD source code and enclosure specifications. Use a code-focused model like Nemotron for best results.
                                    </p>
                                    <select
                                        id="cad-model"
                                        value={selectedCadModelId}
                                        onChange={(e) => setSelectedCadModelId(e.target.value)}
                                        className="w-full p-3 bg-slate-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                                    >
                                        <option value="">{t('settings.defaultArchitect')}</option>
                                        {models.map(m => (
                                            <option key={m.id} value={m.id}>{m.name}</option>
                                        ))}
                                    </select>
                                </div>

                                <div className="mt-5 pt-4 border-t border-gray-100">
                                    <label htmlFor="utility-model" className="block text-sm font-bold text-slate-700 mb-2">{t('settings.utilityModel')}</label>
                                    <p className="text-xs text-slate-600 mb-3">
                                        Covers fabrication briefs, QA protocols, AR guidance, component identification, and audit recommendations.
                                    </p>
                                    <select
                                        id="utility-model"
                                        value={selectedUtilityModelId}
                                        onChange={(e) => setSelectedUtilityModelId(e.target.value)}
                                        className="w-full p-3 bg-slate-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                                    >
                                        <option value="">{t('settings.defaultArchitect')}</option>
                                        {models.map(m => (
                                            <option key={m.id} value={m.id}>{m.name}</option>
                                        ))}
                                    </select>
                                </div>

                                <div className="mt-5 pt-4 border-t border-gray-100">
                                    <label htmlFor="search-reasoning-model" className="block text-sm font-bold text-slate-700 mb-2">{t('settings.searchModel')}</label>
                                    <p className="text-xs text-slate-600 mb-3">
                                        Controls which LLM verifies and extracts pricing data from scraped product pages during procurement search. Defaults to Cloud API.
                                    </p>
                                    <select
                                        id="search-reasoning-model"
                                        value={selectedSearchReasoningId}
                                        onChange={(e) => setSelectedSearchReasoningId(e.target.value)}
                                        className="w-full p-3 bg-slate-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                                    >
                                        <option value="">{t('settings.defaultArchitect')}</option>
                                        {models.map(m => (
                                            <option key={m.id} value={m.id}>{m.name}</option>
                                        ))}
                                    </select>
                                </div>

                                <div className="mt-5 pt-4 border-t border-gray-100">
                                    <label htmlFor="search-api-key" className="block text-sm font-bold text-slate-700 mb-2">{t('settings.searchApiKey')}</label>
                                    <p className="text-xs text-slate-600 mb-3">
                                        {t('settings.searchApiKeyDescription')}
                                    </p>
                                    <input
                                        id="search-api-key"
                                        type="password"
                                        value={searchApiKey}
                                        onChange={(e) => setSearchApiKey(e.target.value)}
                                        className="w-full p-3 bg-slate-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none font-mono"
                                        placeholder={t('settings.blankDefault')}
                                        autoComplete="off"
                                    />
                                </div>
                            </>
                        )}
                    </div>
                </div>

                <div className="p-6 border-t border-gray-100 flex flex-col gap-3 bg-slate-50">
                    <div className="flex justify-end gap-3">
                        {isEnterprise && <Button variant="ghost" onClick={() => fetchModels(serverAddress)}>{t('settings.refreshModels')}</Button>}
                        <Button variant="primary" onClick={handleSave}>{t('settings.save')}</Button>
                    </div>
                    <div className="border-t border-gray-200 pt-3">
                        <p className="text-xs text-slate-600 mb-2 font-medium">{t('settings.privacy')}</p>
                        <div className="flex gap-2">
                            <Button variant="ghost" className="text-xs text-red-600 hover:bg-red-50 flex-1" icon="delete_forever" onClick={async () => {
                                if (window.confirm(t('settings.deleteDataConfirm'))) {
                                    await clearAllUserData();
                                    window.location.reload();
                                }
                            }}>{t('settings.deleteData')}</Button>
                            <Button variant="ghost" className="text-xs text-slate-600 hover:bg-slate-100 flex-1" icon="download" onClick={() => {
                                const data: Record<string, string | null> = {};
                                for (let i = 0; i < localStorage.length; i++) {
                                    const key = localStorage.key(i);
                                    if (key) data[key] = localStorage.getItem(key);
                                }
                                const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
                                const url = URL.createObjectURL(blob);
                                const link = document.createElement('a');
                                link.href = url;
                                link.download = 'buildsheet-data-export.json';
                                link.click();
                                URL.revokeObjectURL(url);
                            }}>{t('settings.exportData')}</Button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
