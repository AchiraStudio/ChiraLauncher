import React from 'react';
import { AlertTriangle, ShieldCheck } from 'lucide-react';
import { ExtensionInfo } from '../../store/extensionStore';

interface ConsentWarningProps {
    extension: ExtensionInfo;
    onAccept: () => void;
    onDecline: () => void;
}

export const ConsentWarning: React.FC<ConsentWarningProps> = ({ extension, onAccept, onDecline }) => {
    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/80 backdrop-blur-md">
            <div className="bg-zinc-900 border border-yellow-500/30 w-full max-w-md rounded-2xl overflow-hidden shadow-2xl">
                <div className="p-6 border-b border-white/5 flex items-center gap-4 bg-yellow-500/5">
                    <div className="p-3 rounded-full bg-yellow-500/10 text-yellow-500">
                        <AlertTriangle className="w-6 h-6" />
                    </div>
                    <div>
                        <h3 className="text-lg font-bold text-white">Security Consent Required</h3>
                        <p className="text-xs text-zinc-400 font-medium tracking-tight">Extension: {extension.name}</p>
                    </div>
                </div>

                <div className="p-6 space-y-4">
                    <p className="text-sm text-zinc-300 leading-relaxed font-medium">
                        This extension is requesting permission to run scripts in your launcher. This could potentially allow it to:
                    </p>

                    <ul className="space-y-2">
                        {extension.permissions.length > 0 ? (
                            extension.permissions.map((p: string, i: number) => (
                                <li key={i} className="flex items-center gap-2 text-xs text-zinc-400 font-bold bg-white/5 p-2 rounded-lg">
                                    <div className="w-1 h-1 rounded-full bg-yellow-500" />
                                    {p.replace(/_/g, ' ')}
                                </li>
                            ))
                        ) : (
                            <li className="flex items-center gap-2 text-xs text-zinc-400 font-bold bg-white/5 p-2 rounded-lg">
                                <ShieldCheck className="w-3 h-3 text-green-500" />
                                No special permissions requested
                            </li>
                        )}
                    </ul>

                    <div className="p-4 rounded-xl bg-red-500/5 border border-red-500/10 mt-4">
                        <p className="text-[10px] text-red-400 font-black uppercase tracking-widest mb-1">Warning</p>
                        <p className="text-[11px] text-red-300/70 font-medium leading-normal">
                            Only grant consent to extensions from authors you trust. Improperly written or malicious extensions can compromise your data.
                        </p>
                    </div>
                </div>

                <div className="p-6 bg-black/20 flex gap-3">
                    <button
                        onClick={onDecline}
                        className="flex-1 px-4 py-3 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-white text-xs font-bold transition-all"
                    >
                        Decline
                    </button>
                    <button
                        onClick={onAccept}
                        className="flex-1 px-4 py-3 rounded-xl bg-yellow-500 hover:bg-yellow-600 text-black text-xs font-bold transition-all"
                    >
                        I Trust This Extension
                    </button>
                </div>
            </div>
        </div>
    );
};
