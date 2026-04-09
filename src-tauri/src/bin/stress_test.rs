use chiralauncher_lib::metadata::{MetadataProvider, OfflineProvider};
use std::sync::Arc;

#[tokio::main]
async fn main() {
    println!("=== Concurrency Stress Test ===");
    println!("Spawning 10 concurrent searches using OfflineProvider...");

    let provider: Arc<dyn MetadataProvider> = Arc::new(OfflineProvider::new());

    let mut handles = Vec::new();

    for i in 0..10 {
        let p = provider.clone();
        let query = format!("The.Witcher.3-SKIDROW-v{}.0", i + 1);
        handles.push(tokio::spawn(async move {
            let result = p.search(&query).await;
            match result {
                Ok(results) => println!("[{}] OK → '{}'", i, results[0].title),
                Err(e) => eprintln!("[{}] ERROR: {}", i, e),
            }
        }));
    }

    for h in handles {
        h.await.expect("Task panicked!");
    }

    println!("=== Stress test complete. No panics or deadlocks. ===");
}
