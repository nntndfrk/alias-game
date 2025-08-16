use chrono::{Duration, Utc};
use jsonwebtoken::{decode, encode, Algorithm, DecodingKey, EncodingKey, Header, Validation};
use shared::errors::AuthError;
use shared::models::{JwtClaims, User};

pub struct JwtService {
    encoding_key: EncodingKey,
    decoding_key: DecodingKey,
    token_duration: Duration,
}

impl JwtService {
    pub fn new(secret: &str) -> Self {
        Self {
            encoding_key: EncodingKey::from_secret(secret.as_bytes()),
            decoding_key: DecodingKey::from_secret(secret.as_bytes()),
            token_duration: Duration::hours(24),
        }
    }

    pub fn generate_token(&self, user: &User) -> Result<String, AuthError> {
        let now = Utc::now();
        let exp = now + self.token_duration;

        let claims = JwtClaims {
            sub: user.id.as_ref().map(|id| id.to_hex()).unwrap_or_default(),
            twitch_id: user.twitch_id.clone(),
            username: user.username.clone(),
            exp: exp.timestamp(),
            iat: now.timestamp(),
        };

        encode(&Header::new(Algorithm::HS256), &claims, &self.encoding_key)
            .map_err(|e| AuthError::InternalError(e.to_string()))
    }

    pub fn verify_token(&self, token: &str) -> Result<JwtClaims, AuthError> {
        let validation = Validation::new(Algorithm::HS256);

        decode::<JwtClaims>(token, &self.decoding_key, &validation)
            .map(|data| data.claims)
            .map_err(|e| e.into())
    }

    pub fn extract_token_from_header(auth_header: &str) -> Option<&str> {
        auth_header.strip_prefix("Bearer ")
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use mongodb::bson::oid::ObjectId;

    #[test]
    fn test_jwt_generation_and_verification() {
        let service = JwtService::new("test-secret");

        let user = User {
            id: Some(ObjectId::new()),
            twitch_id: "123456".to_string(),
            username: "testuser".to_string(),
            display_name: "Test User".to_string(),
            profile_image_url: None,
            email: None,
            created_at: Utc::now(),
            updated_at: Utc::now(),
        };

        let token = service.generate_token(&user).unwrap();
        let claims = service.verify_token(&token).unwrap();

        assert_eq!(claims.twitch_id, user.twitch_id);
        assert_eq!(claims.username, user.username);
    }
}
