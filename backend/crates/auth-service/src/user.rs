use chrono::Utc;
use mongodb::{bson::doc, Collection, Database};
use shared::errors::AuthError;
use shared::models::{TwitchUser, User};

pub struct UserService {
    collection: Collection<User>,
}

impl UserService {
    pub fn new(db: &Database) -> Self {
        Self {
            collection: db.collection("users"),
        }
    }

    pub async fn find_by_twitch_id(&self, twitch_id: &str) -> Result<Option<User>, AuthError> {
        self.collection
            .find_one(doc! { "twitch_id": twitch_id }, None)
            .await
            .map_err(|e| e.into())
    }

    pub async fn create_or_update(&self, twitch_user: &TwitchUser) -> Result<User, AuthError> {
        let now = Utc::now();

        // Try to find existing user
        if let Some(mut user) = self.find_by_twitch_id(&twitch_user.id).await? {
            // Update existing user
            user.username = twitch_user.login.clone();
            user.display_name = twitch_user.display_name.clone();
            user.profile_image_url = Some(twitch_user.profile_image_url.clone());
            user.email = twitch_user.email.clone();
            user.updated_at = now;

            self.collection
                .replace_one(doc! { "twitch_id": &twitch_user.id }, &user, None)
                .await?;

            Ok(user)
        } else {
            // Create new user
            let new_user = User {
                id: None,
                twitch_id: twitch_user.id.clone(),
                username: twitch_user.login.clone(),
                display_name: twitch_user.display_name.clone(),
                profile_image_url: Some(twitch_user.profile_image_url.clone()),
                email: twitch_user.email.clone(),
                created_at: now,
                updated_at: now,
            };

            let result = self.collection.insert_one(&new_user, None).await?;

            let mut user = new_user;
            user.id = Some(result.inserted_id.as_object_id().unwrap());

            Ok(user)
        }
    }
}
