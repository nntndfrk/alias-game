use axum::{
    extract::{Request, State},
    middleware::Next,
    response::Response,
};
use shared::errors::AuthError;

use crate::{AppState, error::AppError};

pub async fn auth_middleware(
    State(state): State<AppState>,
    mut req: Request,
    next: Next,
) -> Result<Response, AppError> {
    let auth_header = req
        .headers()
        .get("Authorization")
        .and_then(|h| h.to_str().ok())
        .ok_or(AppError::from(AuthError::Unauthorized))?;

    let token = auth_header
        .strip_prefix("Bearer ")
        .ok_or(AppError::from(AuthError::InvalidToken))?;

    let claims = state
        .auth_service
        .verify_token(token)
        .map_err(AppError::from)?;

    // Get user from database
    let user = state
        .auth_service
        .get_user_by_id(&claims.sub)
        .await
        .map_err(|_| AppError::from(AuthError::Unauthorized))?
        .ok_or(AppError::from(AuthError::Unauthorized))?;

    // Insert user into request extensions
    tracing::debug!(
        "Authenticated user: {} ({})",
        user.username,
        user.id.as_ref().map(|id| id.to_hex()).unwrap_or_default()
    );
    req.extensions_mut().insert(user);

    Ok(next.run(req).await)
}