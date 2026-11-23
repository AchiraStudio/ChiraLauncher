import { useEffect, useState } from "react";

/**
 * Seconds since `startTime` (unix seconds), re-rendering only the component that
 * calls it, once a second, and only while mounted. Replaces the old global
 * 1s ticker that wrote to a store and woke every subscriber.
 */
export function useElapsed(startTime: number | undefined): number {
    const compute = () => (startTime ? Math.max(0, Math.floor(Date.now() / 1000) - startTime) : 0);
    const [elapsed, setElapsed] = useState(compute);
    useEffect(() => {
        if (!startTime) return;
        setElapsed(compute());
        const id = setInterval(() => setElapsed(compute()), 1000);
        return () => clearInterval(id);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [startTime]);
    return elapsed;
}
