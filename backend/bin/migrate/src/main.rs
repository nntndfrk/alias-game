use mongodb::bson::doc;
use mongodb::Client;
use std::error::Error;
use tracing::{info, error};

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
    
    // Create collections if they don't exist
    info!("Creating collections...");
    
    // Users collection
    let users_exists = db.list_collection_names(doc! {"name": "users"}).await?.contains(&"users".to_string());
    if !users_exists {
        db.create_collection("users", None).await?;
        info!("Created 'users' collection");
    }
    
    // Games collection
    let games_exists = db.list_collection_names(doc! {"name": "games"}).await?.contains(&"games".to_string());
    if !games_exists {
        db.create_collection("games", None).await?;
        info!("Created 'games' collection");
    }
    
    // Words collection
    let words_exists = db.list_collection_names(doc! {"name": "words"}).await?.contains(&"words".to_string());
    if !words_exists {
        db.create_collection("words", None).await?;
        info!("Created 'words' collection");
    }
    
    // Create indexes
    info!("Creating indexes...");
    
    // Users indexes
    let users_collection = db.collection::<mongodb::bson::Document>("users");
    users_collection.create_index(
        mongodb::IndexModel::builder()
            .keys(doc! {"twitch_id": 1})
            .options(mongodb::options::IndexOptions::builder().unique(true).build())
            .build(),
        None
    ).await?;
    
    // Games indexes
    let games_collection = db.collection::<mongodb::bson::Document>("games");
    games_collection.create_index(
        mongodb::IndexModel::builder()
            .keys(doc! {"room_code": 1})
            .options(mongodb::options::IndexOptions::builder().unique(true).build())
            .build(),
        None
    ).await?;
    
    // Words indexes
    let words_collection = db.collection::<mongodb::bson::Document>("words");
    words_collection.create_index(
        mongodb::IndexModel::builder()
            .keys(doc! {"language": 1, "difficulty": 1})
            .build(),
        None
    ).await?;
    
    info!("Migration completed successfully!");
    
    Ok(())
}