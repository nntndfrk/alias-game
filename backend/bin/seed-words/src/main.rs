mod ukrainian_words;

use mongodb::{
    bson::{doc, Document},
    Client,
};
use std::error::Error;
use tracing::info;
use ukrainian_words::{get_ukrainian_words, get_words_count_by_difficulty};

#[tokio::main]
async fn main() -> Result<(), Box<dyn Error>> {
    // Initialize tracing
    tracing_subscriber::fmt::init();

    // Load environment variables
    dotenv::dotenv().ok();

    let mongo_url =
        std::env::var("MONGODB_URL").unwrap_or_else(|_| "mongodb://localhost:27017".to_string());

    info!("Connecting to MongoDB...");
    let client = Client::with_uri_str(&mongo_url).await?;

    let db = client.database("alias_game");
    let collection = db.collection::<Document>("words");

    // Get comprehensive Ukrainian words from the module
    let ukrainian_words = get_ukrainian_words();

    // Display statistics
    let (easy_count, medium_count, hard_count) = get_words_count_by_difficulty();
    info!("Preparing to seed words:");
    info!("  Easy words: {}", easy_count);
    info!("  Medium words: {}", medium_count);
    info!("  Hard words: {}", hard_count);
    info!("  Total words: {}", ukrainian_words.len());

    // Convert to documents
    let documents: Vec<Document> = ukrainian_words
        .into_iter()
        .map(|word| {
            doc! {
                "word": word.word,
                "language": word.language,
                "difficulty": word.difficulty,
                "category": word.category,
            }
        })
        .collect();

    // Clear existing words
    collection
        .delete_many(doc! {"language": "uk"}, None)
        .await?;
    info!("Cleared existing Ukrainian words");

    // Insert new words
    if !documents.is_empty() {
        collection.insert_many(documents, None).await?;
        info!(
            "Inserted {} Ukrainian words",
            collection
                .count_documents(doc! {"language": "uk"}, None)
                .await?
        );
    }

    info!("Word seeding completed successfully!");

    Ok(())
}
