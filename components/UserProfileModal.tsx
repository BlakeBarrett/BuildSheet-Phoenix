import React, { useState } from 'react';
import { User } from '../types.ts';
import { Button, IconButton, Chip } from './Material3UI.tsx';

interface UserProfileModalProps {
    isOpen: boolean;
    onClose: () => void;
    user: User;
    onLogout: () => void;
    onDeleteAccount: () => Promise<void>;
    onExportData: () => void;
    planTier?: string;
    onUpgrade?: () => void;
}

const UserProfileModal: React.FC<UserProfileModalProps> = ({ isOpen, onClose, user, onLogout, onDeleteAccount, onExportData, planTier, onUpgrade }) => {
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [deleteInput, setDeleteInput] = useState('');
    const [isDeleting, setIsDeleting] = useState(false);
    const [deleteError, setDeleteError] = useState('');

    if (!isOpen) return null;

    const handleDelete = async () => {
        if (deleteInput !== 'DELETE') return;
        setIsDeleting(true);
        setDeleteError('');
        try {
            await onDeleteAccount();
        } catch (e: any) {
            // Firebase may throw auth/requires-recent-login
            if (e?.code === 'auth/requires-recent-login') {
                setDeleteError('For security, please sign out and sign back in before deleting your account.');
            } else {
                setDeleteError(e?.message || 'Failed to delete account.');
            }
            setIsDeleting(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[160] bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200" role="dialog" aria-modal="true" aria-labelledby="profile-title" onClick={onClose}>
            <div className="bg-white rounded-[28px] shadow-2xl max-w-md w-full max-h-[90vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-300" onClick={e => e.stopPropagation()}>

                {/* Header */}
                <div className="relative bg-gradient-to-br from-indigo-600 to-indigo-800 p-8 pb-16 text-white">
                    <div className="absolute top-4 right-4">
                        <IconButton icon="close" onClick={onClose} className="text-white/80 hover:bg-white/10 hover:text-white" title="Close" />
                    </div>
                    <h2 id="profile-title" className="text-xs font-bold uppercase tracking-[0.2em] text-indigo-200 mb-1">Account</h2>
                    <p className="text-xl font-bold tracking-tight flex items-center gap-2">
                        {user.name}
                        {planTier && (
                            <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${
                                planTier === 'pro' ? 'bg-amber-400 text-amber-900'
                                : planTier === 'enterprise' ? 'bg-violet-400 text-violet-900'
                                : 'bg-white/20 text-white/80'
                            }`}>
                                {planTier}
                            </span>
                        )}
                    </p>
                </div>

                {/* Avatar — overlapping the header */}
                <div className="relative -mt-10 px-8">
                    <div className="w-20 h-20 rounded-full border-4 border-white shadow-lg overflow-hidden bg-indigo-100">
                        {user.avatar ? (
                            <img src={user.avatar} alt="" className="w-full h-full object-cover" onError={e => { (e.target as HTMLImageElement).style.display = 'none'; (e.target as HTMLImageElement).nextElementSibling?.classList.remove('hidden'); }} />
                        ) : null}
                        <div className={`w-full h-full flex items-center justify-center text-indigo-600 text-3xl font-bold ${user.avatar ? 'hidden' : ''}`}>
                            {user.name.charAt(0).toUpperCase()}
                        </div>
                    </div>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto px-8 pt-4 pb-6 space-y-6">

                    {/* Account Details */}
                    <section>
                        <h3 className="text-[11px] font-bold uppercase tracking-[0.15em] text-slate-400 mb-3">Contact</h3>
                        <div className="space-y-2">
                            <div className="flex items-center gap-3 py-2">
                                <span className="material-symbols-rounded text-[20px] text-slate-400" aria-hidden="true">mail</span>
                                <span className="text-sm text-slate-700">{user.email || 'No email on file'}</span>
                            </div>
                            <div className="flex items-center gap-3 py-2">
                                <span className="material-symbols-rounded text-[20px] text-slate-400" aria-hidden="true">badge</span>
                                <span className="text-sm text-slate-700 font-mono">{user.id.substring(0, 20)}…</span>
                            </div>
                        </div>
                    </section>

                    <hr className="border-gray-100" />

                    {/* Data & Privacy (GDPR) */}
                    <section>
                        <h3 className="text-[11px] font-bold uppercase tracking-[0.15em] text-slate-400 mb-3">Data &amp; Privacy</h3>
                        <p className="text-xs text-slate-500 leading-relaxed mb-4">
                            Under GDPR, CCPA, LGPD, and other regional data protection regulations you have the right to access, export, and delete your personal data at any time.
                        </p>
                        <div className="space-y-2">
                            <Button
                                variant="tonal"
                                icon="download"
                                onClick={onExportData}
                                className="w-full justify-start bg-slate-50 hover:bg-slate-100 text-slate-700"
                            >
                                Export My Data
                            </Button>
                            <p className="text-[11px] text-slate-400 leading-relaxed px-1">
                                Downloads a JSON archive of your projects, build sheets, and activity log. This is your portable copy under the right to data portability.
                            </p>
                        </div>
                    </section>

                    <hr className="border-gray-100" />

                    {/* Upgrade Prompt */}
                    {planTier === 'free' && onUpgrade && (
                        <>
                            <section>
                                <Button
                                    variant="primary"
                                    icon="rocket_launch"
                                    onClick={onUpgrade}
                                    className="w-full"
                                >
                                    Upgrade to Pro
                                </Button>
                                <p className="text-[11px] text-slate-400 leading-relaxed px-1 mt-2">
                                    Unlock unlimited projects, exports, voice mode, AR guide, and more.
                                </p>
                            </section>
                            <hr className="border-gray-100" />
                        </>
                    )}

                    {/* Sign Out */}
                    <section>
                        <Button
                            variant="tonal"
                            icon="logout"
                            onClick={onLogout}
                            className="w-full justify-start bg-slate-50 hover:bg-slate-100 text-slate-700"
                        >
                            Sign Out
                        </Button>
                    </section>

                    <hr className="border-gray-100" />

                    {/* Danger Zone — Delete Account */}
                    <section>
                        <h3 className="text-[11px] font-bold uppercase tracking-[0.15em] text-red-400 mb-3">Danger Zone</h3>
                        {!showDeleteConfirm ? (
                            <Button
                                variant="ghost"
                                icon="delete_forever"
                                onClick={() => setShowDeleteConfirm(true)}
                                className="w-full justify-start text-red-600 hover:bg-red-50"
                            >
                                Delete My Account
                            </Button>
                        ) : (
                            <div className="p-4 bg-red-50 rounded-[16px] space-y-3 border border-red-100">
                                <p className="text-sm text-red-900 font-medium leading-relaxed">
                                    This will <strong>permanently delete</strong> your account and all associated data. This action cannot be undone.
                                </p>
                                <p className="text-xs text-red-700">
                                    Type <strong>DELETE</strong> to confirm:
                                </p>
                                <input
                                    type="text"
                                    value={deleteInput}
                                    onChange={e => setDeleteInput(e.target.value)}
                                    placeholder="DELETE"
                                    className="w-full px-3 py-2 bg-white rounded-[12px] border border-red-200 text-sm text-slate-800 outline-none focus:ring-2 focus:ring-red-300 placeholder:text-slate-300 font-mono"
                                    autoComplete="off"
                                    spellCheck={false}
                                />
                                {deleteError && (
                                    <p className="text-xs text-red-700 font-medium" role="alert">{deleteError}</p>
                                )}
                                <div className="flex gap-2">
                                    <Button
                                        variant="ghost"
                                        onClick={() => { setShowDeleteConfirm(false); setDeleteInput(''); setDeleteError(''); }}
                                        className="flex-1 text-slate-600"
                                        disabled={isDeleting}
                                    >
                                        Cancel
                                    </Button>
                                    <Button
                                        variant="primary"
                                        icon={isDeleting ? 'sync' : 'delete_forever'}
                                        onClick={handleDelete}
                                        disabled={deleteInput !== 'DELETE' || isDeleting}
                                        className={`flex-1 bg-red-600 hover:bg-red-700 border-none ${isDeleting ? 'animate-pulse' : ''}`}
                                    >
                                        {isDeleting ? 'Deleting…' : 'Delete Forever'}
                                    </Button>
                                </div>
                            </div>
                        )}
                        <p className="text-[11px] text-slate-400 leading-relaxed px-1 mt-3">
                            Per GDPR Art. 17, CCPA §1798.105, and LGPD Art. 18, you may request deletion of your personal data at any time. Deletion is irreversible and will remove your authentication credentials, projects, and all stored data.
                        </p>
                    </section>
                </div>
            </div>
        </div>
    );
};

export default UserProfileModal;
