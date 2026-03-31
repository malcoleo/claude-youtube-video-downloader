# gstack

**Web Browsing:** Use the `/browse` skill from gstack for all web browsing. Never use `mcp__claude-in-chrome__*` tools.

**Design System:** Always read `/Users/ml/server/DESIGN.md` before making any visual or UI changes. All colors, typography, spacing, and component patterns are defined there. Do not deviate without explicit approval.

**Available skills:**
- `/office-hours` - YC Office Hours: reframe product ideas before coding
- `/plan-ceo-review` - CEO-level product review
- `/plan-eng-review` - Architecture and engineering review
- `/plan-design-review` - Design audit and recommendations
- `/design-consultation` - Build complete design systems
- `/review` - Pre-merge code review
- `/ship` - Run tests, review, push, open PR
- `/browse` - Headless browser QA testing (~100ms/command)
- `/qa` - Browser-based QA testing with bug fixes
- `/qa-only` - QA testing, report only (no fixes)
- `/design-review` - Visual design audit with fixes
- `/setup-browser-cookies` - Import browser cookies for authenticated testing
- `/retro` - Weekly retrospective analysis
- `/investigate` - Systematic root-cause debugging
- `/document-release` - Update docs after shipping
- `/codex` - Second opinion code review from Codex
- `/careful` - Warn before destructive commands
- `/freeze` - Lock edits to one directory
- `/guard` - Maximum safety mode (careful + freeze)
- `/unfreeze` - Remove edit restrictions
- `/gstack-upgrade` - Update gstack to latest version

## Skill routing

When the user's request matches an available skill, ALWAYS invoke it using the Skill
tool as your FIRST action. Do NOT answer directly, do NOT use other tools first.
The skill has specialized workflows that produce better results than ad-hoc answers.

Key routing rules:
- Product ideas, "is this worth building", brainstorming → invoke office-hours
- Bugs, errors, "why is this broken", 500 errors → invoke investigate
- Ship, deploy, push, create PR → invoke ship
- QA, test the site, find bugs → invoke qa
- Code review, check my diff → invoke review
- Update docs after shipping → invoke document-release
- Weekly retro → invoke retro
- Design system, brand → invoke design-consultation
- Visual audit, design polish → invoke design-review
- Architecture review → invoke plan-eng-review
