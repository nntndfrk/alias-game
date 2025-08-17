use axum::{
    http::StatusCode,
    response::{IntoResponse, Response},
    Json,
};
use serde::Serialize;
use shared::errors::{ApiError, AuthError};

#[derive(Debug)]
pub struct AppError(ApiError);

impl AppError {
    pub fn bad_request(msg: String) -> Self {
        AppError(ApiError::BadRequest(msg))
    }

    pub fn not_found(_msg: String) -> Self {
        AppError(ApiError::NotFound)
    }

    pub fn forbidden(msg: String) -> Self {
        AppError(ApiError::Forbidden(msg))
    }

    pub fn unauthorized() -> Self {
        AppError(ApiError::Auth(AuthError::Unauthorized))
    }
}

impl From<ApiError> for AppError {
    fn from(err: ApiError) -> Self {
        AppError(err)
    }
}

impl From<AuthError> for AppError {
    fn from(err: AuthError) -> Self {
        AppError(ApiError::Auth(err))
    }
}

impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        let (status, message) = match self.0 {
            ApiError::BadRequest(msg) => (StatusCode::BAD_REQUEST, msg),
            ApiError::NotFound => (StatusCode::NOT_FOUND, "Not found".to_string()),
            ApiError::Forbidden(msg) => (StatusCode::FORBIDDEN, msg),
            ApiError::InternalServerError => (
                StatusCode::INTERNAL_SERVER_ERROR,
                "Internal server error".to_string(),
            ),
            ApiError::Auth(auth_err) => match auth_err {
                AuthError::InvalidCredentials => {
                    (StatusCode::UNAUTHORIZED, "Invalid credentials".to_string())
                }
                AuthError::InvalidToken => (StatusCode::UNAUTHORIZED, "Invalid token".to_string()),
                AuthError::TokenExpired => (StatusCode::UNAUTHORIZED, "Token expired".to_string()),
                AuthError::Unauthorized => (StatusCode::UNAUTHORIZED, "Unauthorized".to_string()),
                _ => (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    "Authentication error".to_string(),
                ),
            },
        };

        #[derive(Serialize)]
        struct ErrorResponse {
            error: String,
        }

        (status, Json(ErrorResponse { error: message })).into_response()
    }
}
