"""
FactValidator — cross-references claims against source documents.

Takes a claim and the source text it was derived from, verifies whether
the claim is actually supported by the source.
"""
from __future__ import annotations

import dspy


class ValidateFact(dspy.Signature):
    """Verify whether a claim is supported by its cited source."""

    claim: str = dspy.InputField(desc="The fact/claim to validate")
    source_text: str = dspy.InputField(desc="The original text the claim was extracted from")

    is_verified: bool = dspy.OutputField(desc="True if the source supports the claim")
    confidence: float = dspy.OutputField(desc="0.0 to 1.0")
    reasoning: str = dspy.OutputField(desc="Brief explanation of why this is or isn't verified")


class FactValidator(dspy.Module):
    """Validates extracted facts against their source material."""

    def __init__(self):
        self.validate = dspy.Predict(ValidateFact)

    def forward(self, claim: str, source_text: str) -> dspy.Prediction:
        return self.validate(claim=claim, source_text=source_text)
