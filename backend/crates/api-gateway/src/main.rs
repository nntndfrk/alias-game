use auth_service::AuthService;
use std::collections::HashMap;
use std::net::SocketAddr;
use std::sync::Arc;
use tokio::sync::RwLock;
use tracing::info;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

use api_gateway::{AppState, create_router};

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    // Initialize tracing
    tracing_subscriber::registry()
        .with(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "api_gateway=debug,tower_http=debug".into()),
        )
        .with(tracing_subscriber::fmt::layer())
        .init();

    // Load environment variables
    dotenv::dotenv().ok();

    // Initialize Redis
    let redis_url =
        std::env::var("REDIS_URL").unwrap_or_else(|_| "redis://localhost:6379".to_string());
    let redis_client =
        Arc::new(redis::Client::open(redis_url).expect("Failed to create Redis client"));

    // Initialize MongoDB
    let mongo_url =
        std::env::var("MONGODB_URL").unwrap_or_else(|_| "mongodb://localhost:27017".to_string());
    let mongo_client = Arc::new(
        mongodb::Client::with_uri_str(&mongo_url)
            .await
            .expect("Failed to create MongoDB client"),
    );

    // Get database
    let db = mongo_client.database("alias_game");

    // Initialize Auth Service
    let jwt_secret =
        std::env::var("JWT_SECRET").expect("JWT_SECRET environment variable must be set");
    let twitch_client_id = std::env::var("TWITCH_CLIENT_ID")
        .expect("TWITCH_CLIENT_ID environment variable must be set");
    let twitch_client_secret = std::env::var("TWITCH_CLIENT_SECRET")
        .expect("TWITCH_CLIENT_SECRET environment variable must be set");

    info!("Starting API Gateway with environment variables configured");

    let auth_service = Arc::new(AuthService::new(
        &db,
        &jwt_secret,
        twitch_client_id,
        twitch_client_secret,
    ));

    // Create app state
    let app_state = AppState {
        redis_client,
        mongo_client,
        auth_service,
        rooms: Arc::new(RwLock::new(HashMap::new())),
    };

    let app = create_router(app_state);

    // Start the server
    let addr = SocketAddr::from(([0, 0, 0, 0], 3000));
    info!("API Gateway listening on {}", addr);

    let listener = tokio::net::TcpListener::bind(addr).await?;
    axum::serve(listener, app).await?;

    Ok(())
}
