export function formatPlaytime(seconds: number): string {
    if (seconds === 0) return "Never played";

    // Fallback logic for when minutes is requested and we convert.
    // The user suggested formatPlaytime(minutes), but the processStore and DB use seconds.
    const totalMinutes = Math.floor(seconds / 60);
    if (totalMinutes === 0) return "< 1m played";

    const h = Math.floor(totalMinutes / 60);
    const m = totalMinutes % 60;

    if (h === 0) {
        return `${m}m played`;
    }
    return `${h}h ${m}m played`;
}
