import React, { useEffect } from 'react';
import { useOsIntegrationStore } from '../../store/osIntegrationStore';
import { Monitor, Layout, HardDrive, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

interface OsIntegrationPanelProps {
    gameId: string;
}

export const OsIntegrationPanel: React.FC<OsIntegrationPanelProps> = ({ gameId }) => {
    const { integrations, fetchIntegration, toggleIntegration, isLoading } = useOsIntegrationStore();
    const integration = integrations[gameId];

    useEffect(() => {
        fetchIntegration(gameId);
    }, [gameId, fetchIntegration]);

    const handleToggle = async (type: 'desktop' | 'start_menu' | 'registry') => {
        try {
            await toggleIntegration(gameId, type);
            toast.success(`Updated ${type.replace('_', ' ')} integration`);
        } catch (err) {
            toast.error(`Failed to update ${type} integration`);
        }
    };

    if (!integration && isLoading) {
        return (
            <div className="flex items-center justify-center p-8">
                <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
            </div>
        );
    }

    const items = [
        {
            id: 'desktop' as const,
            label: 'Desktop Shortcut',
            icon: <Monitor className="w-5 h-5" />,
            active: integration?.has_desktop_shortcut,
            description: 'Create a link to this game on your desktop.'
        },
        {
            id: 'start_menu' as const,
            label: 'Start Menu Entry',
            icon: <Layout className="w-5 h-5" />,
            active: integration?.has_start_menu_shortcut,
            description: 'Find this game in your Windows Start Menu.'
        },
        {
            id: 'registry' as const,
            label: 'System Registration',
            icon: <HardDrive className="w-5 h-5" />,
            active: integration?.has_registry_entry,
            description: 'Show in Windows "Apps & Features" for easy management.'
        }
    ];

    return (
        <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {items.map((item) => (
                    <button
                        key={item.id}
                        onClick={() => handleToggle(item.id)}
                        disabled={isLoading}
                        className={`flex flex-col items-start p-4 rounded-xl border transition-all duration-200 text-left group ${item.active
                                ? 'bg-blue-500/10 border-blue-500/30'
                                : 'bg-zinc-900/50 border-zinc-800 hover:border-zinc-700'
                            }`}
                    >
                        <div className={`p-2 rounded-lg mb-3 ${item.active ? 'bg-blue-500 text-white' : 'bg-zinc-800 text-zinc-400'
                            }`}>
                            {item.icon}
                        </div>
                        <h4 className="font-semibold text-sm mb-1">{item.label}</h4>
                        <p className="text-xs text-zinc-500 leading-relaxed font-medium">
                            {item.description}
                        </p>
                        <div className={`mt-3 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${item.active ? 'bg-blue-500/20 text-blue-400' : 'bg-zinc-800 text-zinc-500'
                            }`}>
                            {item.active ? 'Integrated' : 'Disabled'}
                        </div>
                    </button>
                ))}
            </div>
        </div>
    );
};
