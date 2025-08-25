use shared::models::{RoomParticipant, Team};
use std::collections::HashMap;

pub struct TeamManager {
    teams: Vec<Team>,
    #[allow(dead_code)]
    max_teams: usize,
    min_players_per_team: usize,
    max_players_per_team: usize,
}

impl TeamManager {
    pub fn new() -> Self {
        Self {
            teams: vec![
                Team {
                    id: "team_a".to_string(),
                    name: "Команда А".to_string(),
                    color: "#FF6B6B".to_string(), // Red
                    players: Vec::new(),
                    score: 0,
                    is_ready: false,
                },
                Team {
                    id: "team_b".to_string(),
                    name: "Команда Б".to_string(),
                    color: "#4ECDC4".to_string(), // Teal
                    players: Vec::new(),
                    score: 0,
                    is_ready: false,
                },
            ],
            max_teams: 2,
            min_players_per_team: 2,
            max_players_per_team: 5,
        }
    }

    /// Add a player to a specific team
    pub fn add_player_to_team(&mut self, user_id: String, team_id: &str) -> Result<(), String> {
        // Remove player from any existing team first
        self.remove_player(&user_id);

        // Find the team
        let team = self
            .teams
            .iter_mut()
            .find(|t| t.id == team_id)
            .ok_or_else(|| format!("Team {} not found", team_id))?;

        // Check team capacity
        if team.players.len() >= self.max_players_per_team {
            return Err(format!(
                "Team {} is full (max {} players)",
                team.name, self.max_players_per_team
            ));
        }

        // Add player to team
        team.players.push(user_id);

        // Check if team meets minimum requirements
        if team.players.len() >= self.min_players_per_team {
            team.is_ready = true;
        }

        Ok(())
    }

    /// Remove a player from their current team
    pub fn remove_player(&mut self, user_id: &str) -> Option<String> {
        for team in &mut self.teams {
            if let Some(pos) = team.players.iter().position(|id| id == user_id) {
                team.players.remove(pos);

                // Update team ready status
                if team.players.len() < self.min_players_per_team {
                    team.is_ready = false;
                }

                return Some(team.id.clone());
            }
        }
        None
    }

    /// Get the team a player belongs to
    pub fn get_player_team(&self, user_id: &str) -> Option<&Team> {
        self.teams
            .iter()
            .find(|team| team.players.contains(&user_id.to_string()))
    }

    /// Check if all teams are ready to start the game
    pub fn are_all_teams_ready(&self) -> bool {
        // Both teams must be ready
        self.teams.iter().all(|team| team.is_ready)
    }

    /// Get all teams
    pub fn get_teams(&self) -> &[Team] {
        &self.teams
    }

    /// Get a specific team by ID
    pub fn get_team(&self, team_id: &str) -> Option<&Team> {
        self.teams.iter().find(|t| t.id == team_id)
    }

    /// Get mutable reference to a team
    pub fn get_team_mut(&mut self, team_id: &str) -> Option<&mut Team> {
        self.teams.iter_mut().find(|t| t.id == team_id)
    }

    /// Update team score
    pub fn update_score(&mut self, team_id: &str, score_change: i32) -> Result<i32, String> {
        let team = self
            .get_team_mut(team_id)
            .ok_or_else(|| format!("Team {} not found", team_id))?;

        team.score += score_change;
        Ok(team.score)
    }

    /// Reset all team scores
    pub fn reset_scores(&mut self) {
        for team in &mut self.teams {
            team.score = 0;
        }
    }

    /// Auto-balance teams by distributing players evenly
    pub fn auto_balance(&mut self, participants: &HashMap<String, RoomParticipant>) {
        // Collect all players (excluding admin/observer)
        let mut players: Vec<String> = participants
            .values()
            .filter(|p| p.role == shared::models::UserRole::Player)
            .map(|p| p.user_id.clone())
            .collect();

        // Clear existing teams
        for team in &mut self.teams {
            team.players.clear();
            team.is_ready = false;
        }

        // Distribute players evenly
        let mut team_index = 0;
        while !players.is_empty() {
            if let Some(player_id) = players.pop() {
                self.teams[team_index].players.push(player_id);
                team_index = (team_index + 1) % self.teams.len();
            }
        }

        // Update ready status
        for team in &mut self.teams {
            if team.players.len() >= self.min_players_per_team {
                team.is_ready = true;
            }
        }
    }

    /// Get the next explainer for a team (round-robin)
    pub fn get_next_explainer(
        &self,
        team_id: &str,
        previous_explainer: Option<&str>,
    ) -> Option<String> {
        let team = self.get_team(team_id)?;

        if team.players.is_empty() {
            return None;
        }

        // If no previous explainer, return the first player
        if previous_explainer.is_none() {
            return team.players.first().cloned();
        }

        // Find the next player in rotation
        if let Some(prev_index) = team
            .players
            .iter()
            .position(|id| id == previous_explainer.unwrap())
        {
            let next_index = (prev_index + 1) % team.players.len();
            return team.players.get(next_index).cloned();
        }

        // Fallback to first player
        team.players.first().cloned()
    }

    /// Validate team setup for game start
    pub fn validate_for_game_start(&self) -> Result<(), String> {
        // Check minimum teams
        let active_teams = self.teams.iter().filter(|t| !t.players.is_empty()).count();
        if active_teams < 2 {
            return Err("At least 2 teams required to start the game".to_string());
        }

        // Check each team has minimum players
        for team in &self.teams {
            if !team.players.is_empty() && team.players.len() < self.min_players_per_team {
                return Err(format!(
                    "Team {} needs at least {} players (currently has {})",
                    team.name,
                    self.min_players_per_team,
                    team.players.len()
                ));
            }
        }

        // Check if teams are balanced (not too uneven)
        let team_sizes: Vec<usize> = self.teams.iter().map(|t| t.players.len()).collect();
        let max_size = *team_sizes.iter().max().unwrap_or(&0);
        let min_size = *team_sizes.iter().filter(|&&s| s > 0).min().unwrap_or(&0);

        if max_size > 0 && min_size > 0 && max_size - min_size > 2 {
            return Err(
                "Teams are too unbalanced. Difference should not exceed 2 players".to_string(),
            );
        }

        Ok(())
    }

    /// Get team statistics
    pub fn get_statistics(&self) -> TeamStatistics {
        TeamStatistics {
            total_players: self.teams.iter().map(|t| t.players.len()).sum(),
            team_a_players: self.teams[0].players.len(),
            team_b_players: self.teams[1].players.len(),
            team_a_score: self.teams[0].score,
            team_b_score: self.teams[1].score,
            teams_ready: self.are_all_teams_ready(),
        }
    }
}

#[derive(Debug, Clone)]
pub struct TeamStatistics {
    pub total_players: usize,
    pub team_a_players: usize,
    pub team_b_players: usize,
    pub team_a_score: i32,
    pub team_b_score: i32,
    pub teams_ready: bool,
}

impl Default for TeamManager {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_add_player_to_team() {
        let mut manager = TeamManager::new();

        // Add player to team A
        assert!(manager
            .add_player_to_team("user1".to_string(), "team_a")
            .is_ok());
        assert_eq!(manager.teams[0].players.len(), 1);

        // Add another player to team A
        assert!(manager
            .add_player_to_team("user2".to_string(), "team_a")
            .is_ok());
        assert_eq!(manager.teams[0].players.len(), 2);
        assert!(manager.teams[0].is_ready); // Should be ready with 2 players
    }

    #[test]
    fn test_team_capacity() {
        let mut manager = TeamManager::new();

        // Fill team A to capacity
        for i in 1..=5 {
            assert!(manager
                .add_player_to_team(format!("user{}", i), "team_a")
                .is_ok());
        }

        // Try to add one more - should fail
        assert!(manager
            .add_player_to_team("user6".to_string(), "team_a")
            .is_err());
    }

    #[test]
    fn test_player_switching_teams() {
        let mut manager = TeamManager::new();

        // Add player to team A
        manager
            .add_player_to_team("user1".to_string(), "team_a")
            .unwrap();
        assert_eq!(manager.teams[0].players.len(), 1);

        // Switch to team B
        manager
            .add_player_to_team("user1".to_string(), "team_b")
            .unwrap();
        assert_eq!(manager.teams[0].players.len(), 0);
        assert_eq!(manager.teams[1].players.len(), 1);
    }

    #[test]
    fn test_team_validation() {
        let mut manager = TeamManager::new();

        // Not enough teams
        assert!(manager.validate_for_game_start().is_err());

        // Add players to both teams
        manager
            .add_player_to_team("user1".to_string(), "team_a")
            .unwrap();
        manager
            .add_player_to_team("user2".to_string(), "team_a")
            .unwrap();
        manager
            .add_player_to_team("user3".to_string(), "team_b")
            .unwrap();
        manager
            .add_player_to_team("user4".to_string(), "team_b")
            .unwrap();

        // Should be valid now
        assert!(manager.validate_for_game_start().is_ok());
    }
}
