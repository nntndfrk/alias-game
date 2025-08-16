use mongodb::{Client, bson::{doc, Document}};
use serde::{Deserialize, Serialize};
use std::error::Error;
use tracing::{info, error};

#[derive(Debug, Serialize, Deserialize)]
struct Word {
    word: String,
    language: String,
    difficulty: String,
    category: Option<String>,
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn Error>> {
    // Initialize tracing
    tracing_subscriber::fmt::init();

    // Load environment variables
    dotenv::dotenv().ok();

    let mongo_url = std::env::var("MONGODB_URL").unwrap_or_else(|_| "mongodb://localhost:27017".to_string());
    
    info!("Connecting to MongoDB...");
    let client = Client::with_uri_str(&mongo_url).await?;
    
    let db = client.database("alias_game");
    let collection = db.collection::<Document>("words");
    
    // Sample Ukrainian words for the game
    let ukrainian_words = vec![
        Word { word: "кіт".to_string(), language: "uk".to_string(), difficulty: "easy".to_string(), category: Some("тварини".to_string()) },
        Word { word: "собака".to_string(), language: "uk".to_string(), difficulty: "easy".to_string(), category: Some("тварини".to_string()) },
        Word { word: "дім".to_string(), language: "uk".to_string(), difficulty: "easy".to_string(), category: Some("будівлі".to_string()) },
        Word { word: "сонце".to_string(), language: "uk".to_string(), difficulty: "easy".to_string(), category: Some("природа".to_string()) },
        Word { word: "вода".to_string(), language: "uk".to_string(), difficulty: "easy".to_string(), category: Some("природа".to_string()) },
        Word { word: "автомобіль".to_string(), language: "uk".to_string(), difficulty: "medium".to_string(), category: Some("транспорт".to_string()) },
        Word { word: "комп'ютер".to_string(), language: "uk".to_string(), difficulty: "medium".to_string(), category: Some("технології".to_string()) },
        Word { word: "університет".to_string(), language: "uk".to_string(), difficulty: "medium".to_string(), category: Some("освіта".to_string()) },
        Word { word: "демократія".to_string(), language: "uk".to_string(), difficulty: "hard".to_string(), category: Some("політика".to_string()) },
        Word { word: "філософія".to_string(), language: "uk".to_string(), difficulty: "hard".to_string(), category: Some("наука".to_string()) },
    ];
    
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
    collection.delete_many(doc! {"language": "uk"}, None).await?;
    info!("Cleared existing Ukrainian words");
    
    // Insert new words
    if !documents.is_empty() {
        collection.insert_many(documents, None).await?;
        info!("Inserted {} Ukrainian words", collection.count_documents(doc! {"language": "uk"}, None).await?);
    }
    
    info!("Word seeding completed successfully!");
    
    Ok(())
}