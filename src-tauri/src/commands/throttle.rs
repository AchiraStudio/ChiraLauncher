//! A single, global download speed limiter shared by every active download.
//!
//! Each chunk reserves a slot on a shared timeline (`next_free`). A chunk that
//! arrives while earlier chunks still "owe" transmission time must wait for its
//! slot, so the combined rate of all downloads converges on the limit while
//! each download is slowed only as much as needed. Waiting before the next
//! network read also applies TCP back-pressure, so we genuinely stop
//! receiving faster instead of just buffering.
//!
//! This module deliberately has no Tauri dependencies so it can be unit-tested
//! on its own.

use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;
use std::time::{Duration, Instant};

pub struct Throttle {
    /// 0 = unlimited.
    bytes_per_sec: AtomicU64,
    next_free: Mutex<Instant>,
}

impl Default for Throttle {
    fn default() -> Self {
        Self::new()
    }
}

impl Throttle {
    pub fn new() -> Self {
        Self {
            bytes_per_sec: AtomicU64::new(0),
            next_free: Mutex::new(Instant::now()),
        }
    }

    /// Sets the limit in KiB/s (the unit of the "Max download speed" setting). 0 disables limiting.
    pub fn set_limit_kbps(&self, kbps: u32) {
        self.bytes_per_sec.store(u64::from(kbps) * 1024, Ordering::Relaxed);
    }

    /// Reserves transmission time for `bytes` and returns how long the caller must wait.
    pub fn reserve(&self, bytes: u64, now: Instant) -> Duration {
        let limit = self.bytes_per_sec.load(Ordering::Relaxed);
        if limit == 0 || bytes == 0 {
            return Duration::ZERO;
        }
        let mut next = self.next_free.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
        // Idle time is never "banked": after a pause the next chunk starts now, so lifting the
        // limit or resuming can't produce a burst above it.
        let start = (*next).max(now);
        *next = start + Duration::from_secs_f64(bytes as f64 / limit as f64);
        start.saturating_duration_since(now)
    }

    /// Call after receiving a chunk; sleeps just long enough to honour the limit.
    pub async fn pace(&self, bytes: u64) {
        let wait = self.reserve(bytes, Instant::now());
        if !wait.is_zero() {
            tokio::time::sleep(wait).await;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const KIB: u64 = 1024;

    #[test]
    fn unlimited_never_waits() {
        let t = Throttle::new();
        let now = Instant::now();
        assert_eq!(t.reserve(50 * 1024 * KIB, now), Duration::ZERO);
    }

    #[test]
    fn back_to_back_chunks_are_spaced_at_the_limit() {
        let t = Throttle::new();
        t.set_limit_kbps(1000); // 1,024,000 B/s
        let now = Instant::now();
        let one_second_of_data = 1000 * KIB;
        assert_eq!(t.reserve(one_second_of_data, now), Duration::ZERO, "first chunk goes straight through");
        let w2 = t.reserve(one_second_of_data, now);
        let w3 = t.reserve(one_second_of_data, now);
        assert!((w2.as_secs_f64() - 1.0).abs() < 1e-6, "second waits ~1s, got {w2:?}");
        assert!((w3.as_secs_f64() - 2.0).abs() < 1e-6, "third waits ~2s, got {w3:?}");
    }

    #[test]
    fn concurrent_downloads_share_one_budget() {
        // Two downloads each receiving 500 KiB chunks at the same instant share the same timeline
        let t = Throttle::new();
        t.set_limit_kbps(1000);
        let now = Instant::now();
        let mut total_wait = Duration::ZERO;
        for _ in 0..10 {
            total_wait = t.reserve(100 * KIB, now); // 10 chunks of 100 KiB = 1000 KiB in total
        }
        // The tenth chunk must wait for the nine before it: 900 KiB at 1000 KiB/s
        assert!((total_wait.as_secs_f64() - 0.9).abs() < 1e-6, "got {total_wait:?}");
    }

    #[test]
    fn idle_time_is_not_banked() {
        let t = Throttle::new();
        t.set_limit_kbps(100);
        let t0 = Instant::now();
        t.reserve(100 * KIB, t0);
        // 60 seconds later the pipe has long been idle: no waiting, and no burst credit either
        let later = t0 + Duration::from_secs(60);
        assert_eq!(t.reserve(100 * KIB, later), Duration::ZERO);
        assert!((t.reserve(100 * KIB, later).as_secs_f64() - 1.0).abs() < 1e-6);
    }

    #[test]
    fn changing_the_limit_applies_to_the_next_chunk() {
        let t = Throttle::new();
        t.set_limit_kbps(100);
        let now = Instant::now();
        t.reserve(100 * KIB, now); // owes 1s at 100 KiB/s
        t.set_limit_kbps(0);
        assert_eq!(t.reserve(100 * KIB, now), Duration::ZERO, "unlimited again");
    }

    #[tokio::test(start_paused = true)]
    async fn pace_sleeps_for_the_reserved_time() {
        let t = Throttle::new();
        t.set_limit_kbps(100);
        t.pace(100 * KIB).await; // first chunk: free
        let before = tokio::time::Instant::now();
        t.pace(100 * KIB).await; // second must wait ~1s of (virtual) time
        assert!(before.elapsed() >= Duration::from_millis(990));
    }
}
