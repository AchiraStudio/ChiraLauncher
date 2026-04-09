import React, { useEffect, useState } from 'react';
import { useExtensionStore, ExtensionInfo } from '../../store/extensionStore';
import {
    Puzzle,
    Palette,
    Plus,
    Trash2,
    ShieldAlert,
    Settings2,
    CheckCircle2,
    Circle
} from 'lucide-react';
import { ConsentWarning } from './ConsentWarning';

export const ExtensionManager: React.FC = () => {
    const { extensions, fetchExtensions, toggleExtension, installExtension, isLoading } = useExtensionStore();
    const [selectedKind, setSelectedKind] = useState<'all' | 'theme' | 'plugin'>('all');
    const [showConsent, setShowConsent] = useState<ExtensionInfo | null>(null);

    useEffect(() => {
        fetchExtensions();
    }, [fetchExtensions]);

    const filtered = extensions.filter((e: ExtensionInfo) => selectedKind === 'all' || e.kind === selectedKind);

    const handleToggle = (ext: ExtensionInfo) => {
        if (!ext.enabled && !ext.consent_given) {
            setShowConsent(ext);
        } else {
            toggleExtension(ext.id, !ext.enabled);
        }
    };

    return (
        <div className="p-8 space-y-8 max-w-6xl mx-auto">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-3xl font-black uppercase tracking-tight text-white flex items-center gap-3">
                        <Puzzle className="w-8 h-8 text-accent" />
                        Extensions
                    </h2>
                    <p className="text-sm text-zinc-500 font-medium mt-1">Manage themes and plugins to customize your experience.</p>
                </div>

                <button
                    onClick={() => {
                        // In a real app we'd open a file dialog, for now we assume a folder path
                        const path = prompt('Enter path to extension folder:');
                        if (path) installExtension(path);
                    }}
                    className="bg-accent hover:brightness-110 text-white px-5 py-2.5 rounded-xl font-bold flex items-center gap-2 transition-all shadow-lg active:scale-95"
                >
                    <Plus className="w-5 h-5" />
                    Install New
                </button>
            </div>

            <div className="flex gap-2 p-1 bg-white/5 rounded-xl w-fit">
                {(['all', 'theme', 'plugin'] as const).map(k => (
                    <button
                        key={k}
                        onClick={() => setSelectedKind(k)}
                        className={`px-4 py-1.5 rounded-lg text-xs font-bold capitalize transition-all ${selectedKind === k ? 'bg-accent text-white shadow-md' : 'text-zinc-500 hover:text-white'
                            }`}
                    >
                        {k}s
                    </button>
                ))}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {filtered.map((ext: ExtensionInfo) => (
                    <div
                        key={ext.id}
                        className={`p-5 rounded-2xl border transition-all duration-300 group ${ext.enabled
                            ? 'bg-accent/5 border-accent/30'
                            : 'bg-zinc-900/40 border-zinc-800/50 grayscale-[0.5] opacity-80'
                            }`}
                    >
                        <div className="flex items-start justify-between mb-4">
                            <div className="flex gap-4">
                                <div className={`p-3 rounded-xl ${ext.kind === 'theme' ? 'bg-purple-500/10 text-purple-400' : 'bg-blue-500/10 text-blue-400'
                                    }`}>
                                    {ext.kind === 'theme' ? <Palette className="w-6 h-6" /> : <Puzzle className="w-6 h-6" />}
                                </div>
                                <div>
                                    <h3 className="font-bold text-lg text-white group-hover:text-accent transition-colors">
                                        {ext.name}
                                    </h3>
                                    <p className="text-[10px] text-zinc-500 font-black uppercase tracking-widest flex items-center gap-2">
                                        {ext.id} • v{ext.version}
                                    </p>
                                </div>
                            </div>

                            <button
                                onClick={() => handleToggle(ext)}
                                className={`p-2 rounded-lg transition-all ${ext.enabled ? 'text-accent' : 'text-zinc-600 hover:text-zinc-400'
                                    }`}
                            >
                                {ext.enabled ? <CheckCircle2 className="w-6 h-6" /> : <Circle className="w-6 h-6" />}
                            </button>
                        </div>

                        <div className="space-y-3">
                            <div className="flex flex-wrap gap-1.5">
                                {ext.permissions.map((p: string, i: number) => (
                                    <span key={i} className="text-[9px] font-black uppercase tracking-tighter px-2 py-0.5 rounded-md bg-white/5 text-zinc-400 border border-white/5">
                                        {p.replace(/_/g, ' ')}
                                    </span>
                                ))}
                            </div>

                            <div className="flex items-center justify-between pt-4 border-t border-white/5">
                                <div className="flex items-center gap-2">
                                    {!ext.consent_given && (
                                        <span className="flex items-center gap-1 text-[10px] text-amber-500/80 font-black uppercase">
                                            <ShieldAlert className="w-3 h-3" />
                                            Pending Consent
                                        </span>
                                    )}
                                </div>
                                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button className="p-2 text-zinc-500 hover:text-white transition-colors" title="Settings">
                                        <Settings2 className="w-4 h-4" />
                                    </button>
                                    <button className="p-2 text-red-500/50 hover:text-red-500 transition-colors" title="Uninstall">
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                ))}

                {filtered.length === 0 && !isLoading && (
                    <div className="col-span-full py-20 text-center space-y-4 opacity-30">
                        <Puzzle className="w-16 h-16 mx-auto" />
                        <p className="font-black uppercase text-lg">No extensions found</p>
                    </div>
                )}
            </div>

            {showConsent && (
                <ConsentWarning
                    extension={showConsent}
                    onAccept={async () => {
                        // Note: In real setup, we'd update consent_given in DB
                        await toggleExtension(showConsent.id, true);
                        setShowConsent(null);
                    }}
                    onDecline={() => setShowConsent(null)}
                />
            )}
        </div>
    );
};

