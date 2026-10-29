# Personal training and intelligent filtering

The `/training` workspace combines short training sessions, feedback, filter suggestions and personal rule management. It uses indexed metadata only. No training operation connects to a mailbox provider, calls an external model, unsubscribes or moves messages.

## Workflow

1. Import mailbox metadata and open **Intelligente Filterung**.
2. Choose a mailbox and a session of 10, 20 or 50 messages. Sessions survive reloads and can be paused. Previously rated mail is excluded unless repeat review is selected.
3. Choose keep, archive, remove or skip. Optional reason checkboxes and an explanation record your intent. Archive maps to review with a stored archive disposition; it does not perform an archive operation. Remove changes the local recommendation only; provider actions still require the existing approval flow and safeguards.
4. Choose whether the example may contribute to personal patterns. A message-only example does not contribute by default; explicitly enabling contribution permits it to participate. An individual example never activates a rule.
5. After at least three distinct, agreeing messages share sender, category and a subject term, inactive suggestions appear. Dry-runs show counts at each rule condition, how many messages match, how many are skipped by protection and how many would receive each outcome. Representative examples explain the matched terms, age, exceptions and protection reasons. Draft rules can be previewed before saving. Explicit activation is required.
6. Use **Aufräumen → Bestand neu bewerten** to apply the approved rules. Local matches are resolved before external AI grouping/cache lookup. New scans also reuse approved personal rules before optional content inference. Metadata imports can therefore apply a matching approved rule without AI. Existing indexed messages are re-evaluated through the explicit review workflow.

## Rule semantics and safety

Rules are scoped to one mailbox and one user. Exact sender, category and minimum age must all match; at least one subject term must match. Any exception term excludes the message. Sender-only or age-only rules are not supported. Existing protection signals and configured exclusion/age/read constraints take precedence. Priority determines the explanation for agreeing rules; disagreeing active rules return review regardless of priority. The preview uses active indexed metadata only, does not inspect message bodies, and evaluates up to the 50,000 most recent messages when the mailbox is larger.

Manual message edits also record correction feedback. Contradictory corrections deactivate matching active rules. Contradictory training examples suppress suggestions and disable affected rules. Activation refuses conflicting contributing feedback. Edits use revision checks; the last 20 prior rule states are retained. Restoring an earlier version keeps it inactive pending another preview/confirmation. Deleting a rule is permanent; saved rule versions can be restored before deletion.

The execution pipeline reloads active personal rules and checks personal decisions again when applying them. Existing immutable provider action selections, version checks and live provider guards remain in effect.

## Selection and learning boundaries

The selection strategy is an active-learning heuristic: it mixes review/keep/remove decisions and representative examples, while penalizing repetition of senders, subject patterns, categories and age bands. It is not a calibrated uncertainty model. A session holds up to the requested number of available examples, selected from at most 50,000 indexed messages.

The first implementation learns inspectable combinations of metadata features. It does not claim to understand free-text explanations semantically. Explanations are retained as feedback and never executed as prompts or instructions. Rules may be edited to express the intended distinctions. A statistical local classifier such as TF-IDF/logistic regression is optional and is not enabled in this release; introducing one requires enough labeled data and independent evaluation first.

Counts and account-wide recorded AI charges are displayed. Local classification share covers current rule/AI message results, not a historical accuracy score. Unknown charges and counterfactual savings are not measured. No invented savings, precision or recall are displayed. There is no held-out evaluation set yet; fixtures test safety behavior rather than predicting real-world classification accuracy.

## Storage and operation

Migration `007_training.sql` adds tenant-isolated sessions, feedback and learned rules with composite ownership foreign keys. Metadata references cascade when indexed messages or mailboxes are removed. Feedback contains selected metadata features and optional explanations, never full mail bodies. Rule configuration and explanations are plaintext database data: existing backup/access controls apply.

Run `npm run db:migrate` before using the new workspace. `npm run test:training` uses two synthetic accounts and removes them afterward. Unit coverage lives in `tests/personal-filter.test.ts`.
