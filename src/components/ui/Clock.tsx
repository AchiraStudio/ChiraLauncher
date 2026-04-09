import { useState, useEffect } from "react";

export function Clock() {
    const [time, setTime] = useState(() =>
        new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    );

    useEffect(() => {
        const id = setInterval(() => {
            setTime(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }));
        }, 10_000);
        return () => clearInterval(id);
    }, []);

    return (
        <span className="font-bold text-[13px] tracking-widest text-white/60">{time}</span>
    );
}
