# UPR Checkpoint Setup (Pre-commit Hook)

This makes **UPR_CHECKPOINT.md** and **project-structure.txt** auto-update on every commit.

## Steps

1) Extract these files into your repo root:
   - `scripts/generate_checkpoint.mjs`
   - `.githooks/pre-commit`

2) Tell Git to use this hooks folder:
   ```bash
   git config core.hooksPath .githooks
   ```
   macOS/Linux only:
   ```bash
   chmod +x .githooks/pre-commit
   ```

3) (Optional) Add to package.json:
   ```json
   {
     "scripts": { "checkpoint": "node scripts/generate_checkpoint.mjs" }
   }
   ```

4) Seed once:
   ```bash
   node scripts/generate_checkpoint.mjs
   git add UPR_CHECKPOINT.md project-structure.txt
   git commit -m "chore: seed checkpoint"
   ```
