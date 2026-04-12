"""
ProfileBuilder — synthesizes extracted facts into a battle card.

Takes a person's name, role, and all extracted facts, then produces a
structured BattleCard: summary, positions, contradictions, action items.
"""
from __future__ import annotations

import dspy


class BuildProfile(dspy.Signature):
    """Build a comprehensive public accountability profile from extracted facts."""

    person_name: str = dspy.InputField()
    role: str = dspy.InputField()
    organization: str = dspy.InputField()
    facts_json: str = dspy.InputField(desc="JSON array of extracted facts")

    summary: str = dspy.OutputField(
        desc="2-3 sentence overview: who they are, what they're responsible for, why they matter to the case"
    )
    key_positions: list[str] = dspy.OutputField(
        desc="Notable policy positions or stances this person has taken"
    )
    contradictions: list[str] = dspy.OutputField(
        desc="Instances where their public statements contradict their actions or the record"
    )
    organizational_ties: list[str] = dspy.OutputField(
        desc="Organizations, boards, committees this person is connected to"
    )
    action_items: list[str] = dspy.OutputField(
        desc="Concrete actions a parent can take: attend a meeting, file a complaint, contact them, etc."
    )


class ProfileBuilder(dspy.Module):
    """Synthesizes facts into a battle card profile."""

    def __init__(self):
        self.build = dspy.ChainOfThought(BuildProfile)

    def forward(self, person_name: str, role: str, organization: str,
                facts_json: str) -> dspy.Prediction:
        return self.build(
            person_name=person_name,
            role=role,
            organization=organization,
            facts_json=facts_json,
        )
