import { Component, ErrorInfo, ReactNode } from "react";

interface Props {
    children?: ReactNode;
}

interface State {
    hasError: boolean;
    error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
    public state: State = {
        hasError: false,
        error: null
    };

    public static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error };
    }

    public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        console.error("Uncaught error:", error, errorInfo);
    }

    public render() {
        if (this.state.hasError) {
            return (
                <div className="flex flex-col items-center justify-center min-h-screen bg-[#0b0b12] text-white p-4">
                    <h1 className="text-4xl font-black text-red-500 mb-4 tracking-tighter">APP CRASHED</h1>
                    <p className="text-white/50 mb-6 font-medium max-w-lg text-center">{this.state.error?.message}</p>
                    <div className="bg-black/50 border border-white/10 p-4 rounded-lg overflow-auto max-w-full text-left text-xs text-white/40 mb-8 font-mono">
                        {this.state.error?.stack}
                    </div>
                    <button
                        className="bg-accent hover:bg-accent/80 text-white px-6 py-2 rounded-lg font-bold tracking-widest transition-colors shadow-lg"
                        onClick={() => window.location.reload()}
                    >
                        RELOAD APPLICATION
                    </button>
                </div>
            );
        }

        return this.props.children;
    }
}
