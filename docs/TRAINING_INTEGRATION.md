# TULPAR training integration

This branch separates model training from the public AO17/CS50MUSS website.

## Source of truth
- Original teaching materials: `Mustafa7677/CS50MUSS/cpp/lectures/week-0.html` through `week-7.html` and equivalent `java/lectures/` files.
- Use only the author's original C++ and Java lectures. Exclude Harvard CS50 translations.
- Author confirmed permission in chat.

## Reproducible workflow
1. Clone both repositories locally with GitHub access.
2. Extract only the 16 allowlisted original lectures, retaining source paths and source hashes.
3. Split training, validation and test data **by lecture**, not by individual overlapping excerpts.
4. Train the retrieval encoder and/or intent classifier; save random seeds, checkpoints, and hyperparameters.
5. Evaluate on held-out lectures and on genuinely unseen user questions. Never present synthetic intent accuracy as code-solving accuracy.
6. Integrate retrieval-backed responses with citations, abstention for unsupported claims, and a sandboxed code evaluator.
7. Run unit tests and manual browser checks before deployment.

## Status
The original 16 lecture files have been confirmed accessible through the GitHub connector. Full-content transfer into the isolated Python training runtime has **not** been completed, so there is **no claim** that the model was trained on those full texts.

## Safety
No API keys in this repository. No arbitrary user code execution in the browser or API process. Do not alter AO17 automatically.
