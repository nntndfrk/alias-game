use crate::team::TeamManager;
use chrono::Utc;
use futures_util::TryStreamExt;
use mongodb::{bson::doc, Client, Collection};
use rand::seq::SliceRandom;
use shared::models::{GameSettings, GameState, GameWord, Round, Team, WordResult};
use tracing::info;

pub struct GameEngine {
    pub game_state: GameState,
    pub team_manager: TeamManager,
    word_collection: Collection<mongodb::bson::Document>,
    timer_handle: Option<tokio::task::JoinHandle<()>>,
}

impl GameEngine {
    pub async fn new(mongo_client: &Client, settings: Option<GameSettings>) -> Self {
        let db = mongo_client.database("alias_game");
        let word_collection = db.collection("words");

        Self {
            game_state: GameState {
                teams: Vec::new(),
                current_round: None,
                round_history: Vec::new(),
                current_team_index: 0,
                current_word_index: 0,
                used_words: Vec::new(),
                settings: settings.unwrap_or_default(),
                winner_team_id: None,
                started_at: None,
                ended_at: None,
            },
            team_manager: TeamManager::new(),
            word_collection,
            timer_handle: None,
        }
    }

    /// Initialize game with teams
    pub fn initialize_teams(&mut self) -> Result<(), String> {
        // Validate teams are ready
        self.team_manager.validate_for_game_start()?;

        // Copy teams to game state
        self.game_state.teams = self.team_manager.get_teams().to_vec();

        Ok(())
    }

    /// Start the game
    pub async fn start_game(&mut self) -> Result<(), String> {
        if self.game_state.started_at.is_some() {
            return Err("Game already started".to_string());
        }

        self.initialize_teams()?;

        self.game_state.started_at = Some(Utc::now());
        self.game_state.current_team_index = 0;

        info!("Game started with {} teams", self.game_state.teams.len());

        Ok(())
    }

    /// Start a new round
    pub async fn start_round(&mut self) -> Result<Round, String> {
        if self.game_state.winner_team_id.is_some() {
            return Err("Game has already ended".to_string());
        }

        let current_team = self
            .game_state
            .teams
            .get(self.game_state.current_team_index)
            .ok_or("Invalid team index")?
            .clone();

        // Get the explainer for this round
        let previous_explainer = self
            .game_state
            .round_history
            .iter()
            .rev()
            .find(|r| r.team_id == current_team.id)
            .map(|r| r.explainer_id.as_str());

        let explainer_id = self
            .team_manager
            .get_next_explainer(&current_team.id, previous_explainer)
            .ok_or("No explainer available")?;

        // Fetch words for this round
        let words = self.fetch_words_for_round().await?;

        let round = Round {
            round_number: (self.game_state.round_history.len() + 1) as u32,
            team_id: current_team.id.clone(),
            explainer_id,
            words,
            timer_seconds: self.game_state.settings.round_duration_seconds,
            time_remaining: self.game_state.settings.round_duration_seconds,
            score_gained: 0,
            started_at: Some(Utc::now()),
            ended_at: None,
        };

        self.game_state.current_round = Some(round.clone());
        self.game_state.current_word_index = 0;

        info!(
            "Round {} started for team {}",
            round.round_number, round.team_id
        );

        Ok(round)
    }

    /// Fetch words for a round from the database
    async fn fetch_words_for_round(&mut self) -> Result<Vec<GameWord>, String> {
        let difficulty = &self.game_state.settings.difficulty;
        let word_count = self.game_state.settings.words_per_round as usize;

        // Build query based on difficulty
        let query = if difficulty == "mixed" {
            doc! {
                "language": "uk",
                "word": { "$nin": &self.game_state.used_words }
            }
        } else {
            doc! {
                "language": "uk",
                "difficulty": difficulty,
                "word": { "$nin": &self.game_state.used_words }
            }
        };

        // Fetch words from database
        let cursor = self
            .word_collection
            .find(query, None)
            .await
            .map_err(|e| format!("Failed to fetch words: {}", e))?;

        let words: Vec<mongodb::bson::Document> = cursor
            .try_collect()
            .await
            .map_err(|e| format!("Failed to collect words: {}", e))?;

        if words.len() < word_count {
            return Err(format!(
                "Not enough words available. Found {} but need {}",
                words.len(),
                word_count
            ));
        }

        // Randomly select words
        let selected_words: Vec<GameWord> = words
            .choose_multiple(&mut rand::thread_rng(), word_count)
            .map(|doc| {
                let word = doc.get_str("word").unwrap_or("").to_string();
                let difficulty = doc.get_str("difficulty").unwrap_or("medium").to_string();
                let category = doc.get_str("category").ok().map(|s| s.to_string());

                // Add to used words
                self.game_state.used_words.push(word.clone());

                GameWord {
                    word,
                    difficulty,
                    category,
                    result: None,
                    time_spent: None,
                }
            })
            .collect();

        Ok(selected_words)
    }

    /// Process word result (correct, skip, penalty)
    pub fn process_word_result(&mut self, result: WordResult) -> Result<i32, String> {
        let round = self
            .game_state
            .current_round
            .as_mut()
            .ok_or("No active round")?;

        // Check if word already processed
        if round
            .words
            .get(self.game_state.current_word_index)
            .and_then(|w| w.result.as_ref())
            .is_some()
        {
            return Err("Word already processed".to_string());
        }

        // Calculate score change
        let score_change = match result {
            WordResult::Correct => 1,
            WordResult::Skipped => {
                // Check skip penalty
                let skip_count = round
                    .words
                    .iter()
                    .filter(|w| matches!(w.result, Some(WordResult::Skipped)))
                    .count() as u32;

                if skip_count >= self.game_state.settings.skip_penalty_after {
                    -1 // Penalty for too many skips
                } else {
                    0
                }
            }
            WordResult::Penalty => -1,
        };

        // Update word result
        if let Some(current_word) = round.words.get_mut(self.game_state.current_word_index) {
            current_word.result = Some(result);
            current_word.time_spent =
                Some(self.game_state.settings.round_duration_seconds - round.time_remaining);
        }

        // Update round score
        round.score_gained += score_change;

        // Update team score
        if let Some(team) = self
            .game_state
            .teams
            .iter_mut()
            .find(|t| t.id == round.team_id)
        {
            team.score += score_change;
        }

        // Move to next word
        self.game_state.current_word_index += 1;

        info!(
            "Word processed: {:?}, score change: {}",
            result, score_change
        );

        Ok(score_change)
    }

    /// Get current word for explainer
    pub fn get_current_word(&self) -> Option<&GameWord> {
        self.game_state
            .current_round
            .as_ref()
            .and_then(|round| round.words.get(self.game_state.current_word_index))
    }

    /// End the current round
    pub fn end_round(&mut self) -> Result<Round, String> {
        let mut round = self
            .game_state
            .current_round
            .take()
            .ok_or("No active round")?;

        round.ended_at = Some(Utc::now());

        // Calculate final score for the round
        let correct_count = round
            .words
            .iter()
            .filter(|w| matches!(w.result, Some(WordResult::Correct)))
            .count() as i32;

        info!(
            "Round {} ended. Team {} scored {} points ({} correct words)",
            round.round_number, round.team_id, round.score_gained, correct_count
        );

        // Add to history
        self.game_state.round_history.push(round.clone());

        // Move to next team
        self.game_state.current_team_index =
            (self.game_state.current_team_index + 1) % self.game_state.teams.len();

        // Check for winner
        self.check_for_winner();

        Ok(round)
    }

    /// Check if any team has reached the winning score
    fn check_for_winner(&mut self) {
        let winning_team = self
            .game_state
            .teams
            .iter()
            .find(|team| team.score >= self.game_state.settings.win_score);

        if let Some(team) = winning_team {
            self.game_state.winner_team_id = Some(team.id.clone());
            self.game_state.ended_at = Some(Utc::now());

            info!(
                "Game ended! Winner: {} with {} points",
                team.name, team.score
            );
        }
    }

    /// Update timer for current round
    pub fn update_timer(&mut self, time_remaining: u32) -> Result<(), String> {
        let round = self
            .game_state
            .current_round
            .as_mut()
            .ok_or("No active round")?;

        round.time_remaining = time_remaining;

        // Auto-end round if time is up
        if time_remaining == 0 {
            self.end_round()?;
        }

        Ok(())
    }

    /// Pause the game
    pub fn pause_game(&mut self) -> Result<(), String> {
        if self.game_state.current_round.is_none() {
            return Err("No active round to pause".to_string());
        }

        // Cancel timer if running
        if let Some(handle) = self.timer_handle.take() {
            handle.abort();
        }

        info!("Game paused");
        Ok(())
    }

    /// Resume the game
    pub fn resume_game(&mut self) -> Result<(), String> {
        if self.game_state.current_round.is_none() {
            return Err("No active round to resume".to_string());
        }

        info!("Game resumed");
        Ok(())
    }

    /// Get game statistics
    pub fn get_statistics(&self) -> GameStatistics {
        let total_rounds = self.game_state.round_history.len();
        let total_words_shown = self
            .game_state
            .round_history
            .iter()
            .map(|r| r.words.len())
            .sum();

        let total_correct = self
            .game_state
            .round_history
            .iter()
            .flat_map(|r| &r.words)
            .filter(|w| matches!(w.result, Some(WordResult::Correct)))
            .count();

        let total_skipped = self
            .game_state
            .round_history
            .iter()
            .flat_map(|r| &r.words)
            .filter(|w| matches!(w.result, Some(WordResult::Skipped)))
            .count();

        GameStatistics {
            total_rounds: total_rounds as u32,
            total_words_shown,
            total_correct,
            total_skipped,
            teams: self.game_state.teams.clone(),
            winner: self.game_state.winner_team_id.clone(),
            game_duration: self.calculate_game_duration(),
        }
    }

    fn calculate_game_duration(&self) -> Option<i64> {
        match (self.game_state.started_at, self.game_state.ended_at) {
            (Some(start), Some(end)) => Some((end - start).num_seconds()),
            (Some(start), None) => Some((Utc::now() - start).num_seconds()),
            _ => None,
        }
    }

    /// Reset the game
    pub fn reset_game(&mut self) {
        self.game_state = GameState {
            teams: Vec::new(),
            current_round: None,
            round_history: Vec::new(),
            current_team_index: 0,
            current_word_index: 0,
            used_words: Vec::new(),
            settings: self.game_state.settings.clone(),
            winner_team_id: None,
            started_at: None,
            ended_at: None,
        };

        self.team_manager.reset_scores();

        if let Some(handle) = self.timer_handle.take() {
            handle.abort();
        }

        info!("Game reset");
    }
}

#[derive(Debug, Clone)]
pub struct GameStatistics {
    pub total_rounds: u32,
    pub total_words_shown: usize,
    pub total_correct: usize,
    pub total_skipped: usize,
    pub teams: Vec<Team>,
    pub winner: Option<String>,
    pub game_duration: Option<i64>, // in seconds
}

#[cfg(test)]
mod tests {
    // Add tests here when MongoDB test setup is available
}
