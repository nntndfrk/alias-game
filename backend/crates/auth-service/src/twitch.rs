use reqwest::Client;
use shared::errors::AuthError;
use shared::models::{TwitchTokenResponse, TwitchUserResponse};
use tracing;

const TWITCH_OAUTH_TOKEN_URL: &str = "https://id.twitch.tv/oauth2/token";
const TWITCH_USER_API_URL: &str = "https://api.twitch.tv/helix/users";

pub struct TwitchClient {
    client: Client,
    client_id: String,
    client_secret: String,
}

impl TwitchClient {
    pub fn new(client_id: String, client_secret: String) -> Self {
        Self {
            client: Client::new(),
            client_id,
            client_secret,
        }
    }

    pub async fn exchange_code(
        &self,
        code: &str,
        redirect_uri: &str,
    ) -> Result<TwitchTokenResponse, AuthError> {
        tracing::info!(
            "Attempting Twitch token exchange: code={}, redirect_uri={}",
            code,
            redirect_uri
        );

        let params = [
            ("client_id", &self.client_id),
            ("client_secret", &self.client_secret),
            ("code", &code.to_string()),
            ("grant_type", &"authorization_code".to_string()),
            ("redirect_uri", &redirect_uri.to_string()),
        ];

        let response = self
            .client
            .post(TWITCH_OAUTH_TOKEN_URL)
            .form(&params)
            .send()
            .await?;

        if !response.status().is_success() {
            let status = response.status();
            let error_text = response.text().await.unwrap_or_default();
            tracing::error!(
                "Twitch token exchange failed: status={}, body={}, code={}, redirect_uri={}",
                status,
                error_text,
                code,
                redirect_uri
            );
            return Err(AuthError::TwitchApiError(format!(
                "Failed to exchange code (status: {status}): {error_text}"
            )));
        }

        response
            .json::<TwitchTokenResponse>()
            .await
            .map_err(|e| AuthError::TwitchApiError(e.to_string()))
    }

    pub async fn get_user(&self, access_token: &str) -> Result<TwitchUserResponse, AuthError> {
        let response = self
            .client
            .get(TWITCH_USER_API_URL)
            .header("Authorization", format!("Bearer {access_token}"))
            .header("Client-Id", &self.client_id)
            .send()
            .await?;

        if !response.status().is_success() {
            let error_text = response.text().await.unwrap_or_default();
            return Err(AuthError::TwitchApiError(format!(
                "Failed to get user info: {error_text}"
            )));
        }

        response
            .json::<TwitchUserResponse>()
            .await
            .map_err(|e| AuthError::TwitchApiError(e.to_string()))
    }

    pub async fn validate_token(&self, access_token: &str) -> Result<bool, AuthError> {
        let response = self
            .client
            .get("https://id.twitch.tv/oauth2/validate")
            .header("Authorization", format!("Bearer {access_token}"))
            .send()
            .await?;

        Ok(response.status().is_success())
    }
}
