pub mod jwt;
pub mod twitch;
pub mod user;

use mongodb::Database;
use shared::errors::AuthError;
use shared::models::{LoginRequest, LoginResponse};

pub struct AuthService {
    jwt_service: jwt::JwtService,
    twitch_client: twitch::TwitchClient,
    user_service: user::UserService,
}

impl AuthService {
    pub fn new(
        db: &Database,
        jwt_secret: &str,
        twitch_client_id: String,
        twitch_client_secret: String,
    ) -> Self {
        Self {
            jwt_service: jwt::JwtService::new(jwt_secret),
            twitch_client: twitch::TwitchClient::new(twitch_client_id, twitch_client_secret),
            user_service: user::UserService::new(db),
        }
    }

    pub async fn login(&self, request: LoginRequest) -> Result<LoginResponse, AuthError> {
        // Exchange code for tokens
        let token_response = self
            .twitch_client
            .exchange_code(&request.code, &request.redirect_uri)
            .await?;

        // Get user info from Twitch
        let user_response = self
            .twitch_client
            .get_user(&token_response.access_token)
            .await?;

        let twitch_user = user_response
            .data
            .first()
            .ok_or_else(|| AuthError::TwitchApiError("No user data returned".to_string()))?;

        // Create or update user in database
        let user = self.user_service.create_or_update(twitch_user).await?;

        // Generate JWT token
        let jwt_token = self.jwt_service.generate_token(&user)?;

        Ok(LoginResponse {
            access_token: jwt_token,
            user: user.into(),
        })
    }

    pub fn verify_token(&self, token: &str) -> Result<shared::models::JwtClaims, AuthError> {
        self.jwt_service.verify_token(token)
    }

    pub async fn get_user_by_id(
        &self,
        user_id: &str,
    ) -> Result<Option<shared::models::User>, AuthError> {
        self.user_service.get_by_id(user_id).await
    }
}
