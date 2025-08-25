use shared::models::{Round, Team, WordResult};
use std::collections::HashMap;

pub struct ScoringSystem {
    points_per_correct: i32,
    points_per_skip: i32,
    penalty_per_violation: i32,
    skip_penalty_threshold: u32,
    bonus_for_all_correct: i32,
    time_bonus_threshold: u32, // seconds
    time_bonus_points: i32,
}

impl Default for ScoringSystem {
    fn default() -> Self {
        Self {
            points_per_correct: 1,
            points_per_skip: 0,
            penalty_per_violation: -1,
            skip_penalty_threshold: 3,
            bonus_for_all_correct: 5,
            time_bonus_threshold: 30, // If completed in under 30 seconds
            time_bonus_points: 3,
        }
    }
}

impl ScoringSystem {
    pub fn new() -> Self {
        Self::default()
    }

    /// Calculate score for a single word result
    pub fn calculate_word_score(&self, result: WordResult, skip_count: u32) -> i32 {
        match result {
            WordResult::Correct => self.points_per_correct,
            WordResult::Skipped => {
                if skip_count > self.skip_penalty_threshold {
                    self.penalty_per_violation
                } else {
                    self.points_per_skip
                }
            }
            WordResult::Penalty => self.penalty_per_violation,
        }
    }

    /// Calculate total score for a round
    pub fn calculate_round_score(&self, round: &Round) -> RoundScore {
        let mut correct_count = 0;
        let mut skip_count = 0;
        let mut penalty_count = 0;
        let mut base_score = 0;

        for word in &round.words {
            if let Some(result) = &word.result {
                match result {
                    WordResult::Correct => {
                        correct_count += 1;
                        base_score += self.points_per_correct;
                    }
                    WordResult::Skipped => {
                        skip_count += 1;
                        if skip_count > self.skip_penalty_threshold {
                            base_score += self.penalty_per_violation;
                        } else {
                            base_score += self.points_per_skip;
                        }
                    }
                    WordResult::Penalty => {
                        penalty_count += 1;
                        base_score += self.penalty_per_violation;
                    }
                }
            }
        }

        // Calculate bonuses
        let mut bonuses = 0;

        // All correct bonus
        if correct_count == round.words.len() && penalty_count == 0 {
            bonuses += self.bonus_for_all_correct;
        }

        // Time bonus (if round completed quickly)
        let time_used = round.timer_seconds - round.time_remaining;
        if time_used <= self.time_bonus_threshold && correct_count > 0 {
            bonuses += self.time_bonus_points;
        }

        RoundScore {
            base_score,
            bonuses,
            total_score: base_score + bonuses,
            correct_count,
            skip_count: skip_count as usize,
            penalty_count,
            time_used,
        }
    }

    /// Calculate team rankings
    pub fn calculate_rankings(&self, teams: &[Team]) -> Vec<TeamRanking> {
        let mut rankings: Vec<TeamRanking> = teams
            .iter()
            .map(|team| TeamRanking {
                team_id: team.id.clone(),
                team_name: team.name.clone(),
                score: team.score,
                rank: 0,
            })
            .collect();

        // Sort by score (descending)
        rankings.sort_by(|a, b| b.score.cmp(&a.score));

        // Assign ranks
        let mut current_rank = 1;
        let mut prev_score = None;

        for ranking in &mut rankings {
            if let Some(prev) = prev_score {
                if ranking.score < prev {
                    current_rank += 1;
                }
            }
            ranking.rank = current_rank;
            prev_score = Some(ranking.score);
        }

        rankings
    }

    /// Calculate game MVP (Most Valuable Player)
    pub fn calculate_mvp(&self, rounds: &[Round]) -> Option<PlayerStats> {
        let mut player_stats: HashMap<String, PlayerStats> = HashMap::new();

        for round in rounds {
            let stats = player_stats
                .entry(round.explainer_id.clone())
                .or_insert_with(|| PlayerStats {
                    player_id: round.explainer_id.clone(),
                    rounds_played: 0,
                    total_correct: 0,
                    total_skipped: 0,
                    total_penalties: 0,
                    total_score: 0,
                    average_time_per_word: 0.0,
                });

            stats.rounds_played += 1;

            for word in &round.words {
                if let Some(result) = &word.result {
                    match result {
                        WordResult::Correct => stats.total_correct += 1,
                        WordResult::Skipped => stats.total_skipped += 1,
                        WordResult::Penalty => stats.total_penalties += 1,
                    }
                }
            }

            stats.total_score += round.score_gained;
        }

        // Calculate average time per word
        for stats in player_stats.values_mut() {
            if stats.total_correct > 0 {
                // This is simplified - in real implementation, we'd track actual time per word
                stats.average_time_per_word = 60.0 / stats.total_correct as f32;
            }
        }

        // Find player with highest score
        player_stats
            .into_values()
            .max_by_key(|stats| stats.total_score)
    }

    /// Calculate efficiency rating for a player
    pub fn calculate_efficiency(&self, correct: usize, total: usize) -> f32 {
        if total == 0 {
            return 0.0;
        }
        (correct as f32 / total as f32) * 100.0
    }

    /// Get score breakdown for display
    pub fn get_score_breakdown(&self, round: &Round) -> ScoreBreakdown {
        let round_score = self.calculate_round_score(round);

        ScoreBreakdown {
            correct_words: format!(
                "{} words × {} points = {}",
                round_score.correct_count,
                self.points_per_correct,
                round_score.correct_count as i32 * self.points_per_correct
            ),
            skipped_words: if round_score.skip_count > 0 {
                if round_score.skip_count > self.skip_penalty_threshold as usize {
                    format!(
                        "{} skips (penalty after {}) = -{}",
                        round_score.skip_count,
                        self.skip_penalty_threshold,
                        (round_score.skip_count as i32 - self.skip_penalty_threshold as i32).abs()
                    )
                } else {
                    format!("{} skips × 0 points = 0", round_score.skip_count)
                }
            } else {
                "No skips".to_string()
            },
            penalties: if round_score.penalty_count > 0 {
                format!(
                    "{} penalties × {} = {}",
                    round_score.penalty_count,
                    self.penalty_per_violation,
                    round_score.penalty_count as i32 * self.penalty_per_violation
                )
            } else {
                "No penalties".to_string()
            },
            bonuses: if round_score.bonuses > 0 {
                let mut bonus_details = Vec::new();
                if round_score.correct_count == round.words.len() {
                    bonus_details.push(format!("Perfect round: +{}", self.bonus_for_all_correct));
                }
                if round_score.time_used <= self.time_bonus_threshold {
                    bonus_details.push(format!("Speed bonus: +{}", self.time_bonus_points));
                }
                bonus_details.join(", ")
            } else {
                "No bonuses".to_string()
            },
            total: format!("Total: {} points", round_score.total_score),
        }
    }
}

#[derive(Debug, Clone)]
pub struct RoundScore {
    pub base_score: i32,
    pub bonuses: i32,
    pub total_score: i32,
    pub correct_count: usize,
    pub skip_count: usize,
    pub penalty_count: usize,
    pub time_used: u32,
}

#[derive(Debug, Clone)]
pub struct TeamRanking {
    pub team_id: String,
    pub team_name: String,
    pub score: i32,
    pub rank: u32,
}

#[derive(Debug, Clone)]
pub struct PlayerStats {
    pub player_id: String,
    pub rounds_played: u32,
    pub total_correct: usize,
    pub total_skipped: usize,
    pub total_penalties: usize,
    pub total_score: i32,
    pub average_time_per_word: f32,
}

#[derive(Debug, Clone)]
pub struct ScoreBreakdown {
    pub correct_words: String,
    pub skipped_words: String,
    pub penalties: String,
    pub bonuses: String,
    pub total: String,
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::Utc;
    use shared::models::GameWord;

    #[test]
    fn test_word_scoring() {
        let scoring = ScoringSystem::new();

        assert_eq!(scoring.calculate_word_score(WordResult::Correct, 0), 1);
        assert_eq!(scoring.calculate_word_score(WordResult::Skipped, 0), 0);
        assert_eq!(scoring.calculate_word_score(WordResult::Skipped, 3), 0);
        assert_eq!(scoring.calculate_word_score(WordResult::Skipped, 4), -1); // Penalty after 3 skips
        assert_eq!(scoring.calculate_word_score(WordResult::Penalty, 0), -1);
    }

    #[test]
    fn test_round_scoring() {
        let scoring = ScoringSystem::new();

        let round = Round {
            round_number: 1,
            team_id: "team_a".to_string(),
            explainer_id: "player1".to_string(),
            words: vec![
                GameWord {
                    word: "test1".to_string(),
                    difficulty: "easy".to_string(),
                    category: None,
                    result: Some(WordResult::Correct),
                    time_spent: Some(5),
                },
                GameWord {
                    word: "test2".to_string(),
                    difficulty: "easy".to_string(),
                    category: None,
                    result: Some(WordResult::Correct),
                    time_spent: Some(5),
                },
                GameWord {
                    word: "test3".to_string(),
                    difficulty: "easy".to_string(),
                    category: None,
                    result: Some(WordResult::Skipped),
                    time_spent: Some(3),
                },
            ],
            timer_seconds: 60,
            time_remaining: 47,
            score_gained: 2,
            started_at: Some(Utc::now()),
            ended_at: Some(Utc::now()),
        };

        let score = scoring.calculate_round_score(&round);
        assert_eq!(score.correct_count, 2);
        assert_eq!(score.skip_count, 1);
        assert_eq!(score.penalty_count, 0);
        assert_eq!(score.base_score, 2); // 2 correct, 1 skip (no penalty yet)
        assert_eq!(score.time_used, 13);
        assert_eq!(score.bonuses, 3); // Time bonus for completing in under 30 seconds
        assert_eq!(score.total_score, 5);
    }

    #[test]
    fn test_team_rankings() {
        let scoring = ScoringSystem::new();

        let teams = vec![
            Team {
                id: "team_a".to_string(),
                name: "Team A".to_string(),
                color: "#FF0000".to_string(),
                players: vec![],
                score: 25,
                is_ready: true,
            },
            Team {
                id: "team_b".to_string(),
                name: "Team B".to_string(),
                color: "#00FF00".to_string(),
                players: vec![],
                score: 30,
                is_ready: true,
            },
            Team {
                id: "team_c".to_string(),
                name: "Team C".to_string(),
                color: "#0000FF".to_string(),
                players: vec![],
                score: 30,
                is_ready: true,
            },
        ];

        let rankings = scoring.calculate_rankings(&teams);

        assert_eq!(rankings[0].rank, 1);
        assert_eq!(rankings[0].score, 30);
        assert_eq!(rankings[1].rank, 1); // Same score, same rank
        assert_eq!(rankings[1].score, 30);
        assert_eq!(rankings[2].rank, 2);
        assert_eq!(rankings[2].score, 25);
    }

    #[test]
    fn test_efficiency_calculation() {
        let scoring = ScoringSystem::new();

        assert_eq!(scoring.calculate_efficiency(8, 10), 80.0);
        assert_eq!(scoring.calculate_efficiency(0, 10), 0.0);
        assert_eq!(scoring.calculate_efficiency(10, 10), 100.0);
        assert_eq!(scoring.calculate_efficiency(5, 0), 0.0);
    }
}
