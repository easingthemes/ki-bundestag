## [1.7.7](https://github.com/easingthemes/ki-bundestag/compare/v1.7.6...v1.7.7) (2026-04-09)


### Bug Fixes

* show bot-controller seats alongside human seats in parliament roster ([b8898dc](https://github.com/easingthemes/ki-bundestag/commit/b8898dccbb080b4fecce62c97804cea68dacdbc7))

## [1.7.6](https://github.com/easingthemes/ki-bundestag/compare/v1.7.5...v1.7.6) (2026-04-09)


### Bug Fixes

* enforce APPROVAL_MAX (60%) cap consistently across all approval mutations ([caff575](https://github.com/easingthemes/ki-bundestag/commit/caff575562913b4d77cb776f502d4e30f473539f))

## [1.7.5](https://github.com/easingthemes/ki-bundestag/compare/v1.7.4...v1.7.5) (2026-04-06)

## [1.7.4](https://github.com/easingthemes/ki-bundestag/compare/v1.7.3...v1.7.4) (2026-04-06)


### Bug Fixes

* make approval ratings zero-sum to prevent universal upward trend ([1759b89](https://github.com/easingthemes/ki-bundestag/commit/1759b897702bd8222c88e3aa1e9b9415b9edc9bb))

## [1.7.3](https://github.com/easingthemes/ki-bundestag/compare/v1.7.2...v1.7.3) (2026-04-04)


### Bug Fixes

* prevent mobile horizontal body scroll with layered overflow containment ([67bacb5](https://github.com/easingthemes/ki-bundestag/commit/67bacb54eaa5280250968a7fca34b9b6c185e541))

## [1.7.2](https://github.com/easingthemes/ki-bundestag/compare/v1.7.1...v1.7.2) (2026-04-04)


### Bug Fixes

* disable structured output for party agents to avoid grammar compilation timeout ([3d71507](https://github.com/easingthemes/ki-bundestag/commit/3d71507b30b98c9f888c0c20902aec5fed12a6dd))
* **engine:** stop simulation on partial party agent batch failures ([68e764b](https://github.com/easingthemes/ki-bundestag/commit/68e764b004ededf94f832fbfc7fa9cc12cd54aa3))

## [1.7.1](https://github.com/easingthemes/ki-bundestag/compare/v1.7.0...v1.7.1) (2026-04-04)


### Bug Fixes

* align "Decision of the Month" to actual sim calendar month ([74748d5](https://github.com/easingthemes/ki-bundestag/commit/74748d5c4862fef5f608472b78192648a90123a4))
* align Party of the Month to actual sim calendar month ([19a7d30](https://github.com/easingthemes/ki-bundestag/commit/19a7d3067d6b109f4642a071c1709bd89c3893bc))
* show simulation month name in dashboard "Entscheidung/Partei des Monats" ([b267756](https://github.com/easingthemes/ki-bundestag/commit/b267756a737f5ac01e98c57df5b5a9ce9d0301a3))

# [1.7.0](https://github.com/easingthemes/ki-bundestag/compare/v1.6.0...v1.7.0) (2026-04-03)


### Features

* add --bots flag to seed-demo-users script ([9a56fc6](https://github.com/easingthemes/ki-bundestag/commit/9a56fc68e068928eedac5bd0d8460ea670dbfceb))
* cap bot users at target count (default 100) ([97d86fa](https://github.com/easingthemes/ki-bundestag/commit/97d86fad88caf8c4a0ea4def890682e6f261a194))
* migrate existing demo users to bot status on seed ([a020d5e](https://github.com/easingthemes/ki-bundestag/commit/a020d5e4b9e97c11007939b69d372dde742f2fa3))

# [1.6.0](https://github.com/easingthemes/ki-bundestag/compare/v1.5.0...v1.6.0) (2026-04-03)


### Bug Fixes

* enforce daily limits on bot content-generating actions ([e5fd0b0](https://github.com/easingthemes/ki-bundestag/commit/e5fd0b02a43e9af157e2760ae8cfefbcab02d809))


### Features

* add bot users with isBot flag, UI badges, and activity runner ([c77a856](https://github.com/easingthemes/ki-bundestag/commit/c77a8567aac247589d30392970c5d539af584bfc))
* add PM2 bot runner loop + status reporter ([7bcfe2d](https://github.com/easingthemes/ki-bundestag/commit/7bcfe2db09682215ae09b3a589b9275d6044925f))

# [1.5.0](https://github.com/easingthemes/ki-bundestag/compare/v1.4.0...v1.5.0) (2026-04-03)


### Features

* expose debates prominently with dedicated page and dashboard section ([7ae4b4a](https://github.com/easingthemes/ki-bundestag/commit/7ae4b4ab43bb01456e224689391ef86afcbd86ed))

# [1.4.0](https://github.com/easingthemes/ki-bundestag/compare/v1.3.1...v1.4.0) (2026-04-03)


### Features

* **engine:** add inactivity penalty and activity bonus to approval system ([256af2a](https://github.com/easingthemes/ki-bundestag/commit/256af2a431e44d98e2baa69967b512213bdee517))

## [1.3.1](https://github.com/easingthemes/ki-bundestag/compare/v1.3.0...v1.3.1) (2026-04-03)


### Bug Fixes

* **engine:** reduce structured output optional params to fix batch API errors ([32fb242](https://github.com/easingthemes/ki-bundestag/commit/32fb242fc08ff7a56ed88c7c9f6544e855170e9e))

# [1.3.0](https://github.com/easingthemes/ki-bundestag/compare/v1.2.1...v1.3.0) (2026-04-02)


### Bug Fixes

* **engine:** detect auth/billing errors and stop sim immediately ([faea5f9](https://github.com/easingthemes/ki-bundestag/commit/faea5f91982882f5b896c2d898b6745ec7ebfcfd))
* **engine:** translate negotiation prompts and event titles to German ([e2d3593](https://github.com/easingthemes/ki-bundestag/commit/e2d359323480c518902d73b1315907251beff0d0))


### Features

* **scripts:** add rollback-to-day script for simulation recovery ([c81acfb](https://github.com/easingthemes/ki-bundestag/commit/c81acfbef8a1d2c67b405e71204b98df1a6c2887))

## [1.2.1](https://github.com/easingthemes/ki-bundestag/compare/v1.2.0...v1.2.1) (2026-04-02)


### Bug Fixes

* **engine:** harden AI JSON extraction with brace-matching fallback ([6b5d6fc](https://github.com/easingthemes/ki-bundestag/commit/6b5d6fcaa194427c746f12e9c2de2813a3614a1a))

# [1.2.0](https://github.com/easingthemes/ki-bundestag/compare/v1.1.0...v1.2.0) (2026-04-02)


### Bug Fixes

* **ci:** make pre-deploy backup script resilient to missing file ([8eb6655](https://github.com/easingthemes/ki-bundestag/commit/8eb66558c2b7b50dd90679971b127d9b56798edf))
* **web:** restore original landing page at /landing ([db11284](https://github.com/easingthemes/ki-bundestag/commit/db11284f7f7f5e45fdac605de49fe33fb1d2673b))


### Features

* **seo:** add BreadcrumbList JSON-LD to prerendered subpages ([f36a4dc](https://github.com/easingthemes/ki-bundestag/commit/f36a4dc1b6d66acb83eb70e732ddcb7fcf833ee5))


### Reverts

* Revert "feat(web): add static landing page at /landing for SEO" ([bc1571e](https://github.com/easingthemes/ki-bundestag/commit/bc1571ec30bb14a31075a4fc900b5ee6176fb2fe))
* Revert "feat(web): improve landing page SEO — disclaimer, breadcrumbs, contextual links" ([6316f45](https://github.com/easingthemes/ki-bundestag/commit/6316f45f15a9b30894a5fa0635dab1f52c0ba43d))

# [1.2.0](https://github.com/easingthemes/ki-bundestag/compare/v1.1.0...v1.2.0) (2026-04-02)


### Bug Fixes

* **ci:** make pre-deploy backup script resilient to missing file ([8eb6655](https://github.com/easingthemes/ki-bundestag/commit/8eb66558c2b7b50dd90679971b127d9b56798edf))


### Features

* **seo:** add BreadcrumbList JSON-LD to prerendered subpages ([f36a4dc](https://github.com/easingthemes/ki-bundestag/commit/f36a4dc1b6d66acb83eb70e732ddcb7fcf833ee5))


### Reverts

* Revert "feat(web): add static landing page at /landing for SEO" ([bc1571e](https://github.com/easingthemes/ki-bundestag/commit/bc1571ec30bb14a31075a4fc900b5ee6176fb2fe))
* Revert "feat(web): improve landing page SEO — disclaimer, breadcrumbs, contextual links" ([6316f45](https://github.com/easingthemes/ki-bundestag/commit/6316f45f15a9b30894a5fa0635dab1f52c0ba43d))

# [1.1.0](https://github.com/easingthemes/ki-bundestag/compare/v1.0.1...v1.1.0) (2026-04-02)


### Features

* **web:** add static landing page at /landing for SEO ([b86ee02](https://github.com/easingthemes/ki-bundestag/commit/b86ee021dfa30ea742585e77bc43f6d0933c8230))
* **web:** improve landing page SEO — disclaimer, breadcrumbs, contextual links ([dc825a3](https://github.com/easingthemes/ki-bundestag/commit/dc825a34e04be3c447b0407d23d784178a91ad37))

## [1.0.1](https://github.com/easingthemes/ki-bundestag/compare/v1.0.0...v1.0.1) (2026-04-02)


### Bug Fixes

* disable semantic-release issue/PR comments ([2725ef0](https://github.com/easingthemes/ki-bundestag/commit/2725ef07755790b89c3e3ea004e23ac7de38c247))

# 1.0.0 (2026-04-02)


### Bug Fixes

* abgeordnetenwatch fallback + better non-existent bill warnings ([ba2f560](https://github.com/easingthemes/ki-bundestag/commit/ba2f560ca17b9a6ef8d3ec39a21c5ae89d04dcf0))
* add type declaration for highcharts-react-official ([0e4233f](https://github.com/easingthemes/ki-bundestag/commit/0e4233fdddecc5ccc72931c24e9fae41efe36f91))
* address PR review feedback for day progress bar ([86ec2c0](https://github.com/easingthemes/ki-bundestag/commit/86ec2c07d31e8d2c4d171ac52b1a4bb053bc995e))
* **api:** add global Express error handler middleware ([782f2e3](https://github.com/easingthemes/ki-bundestag/commit/782f2e3e89ffe588856de6d8cdca7625a8c4eb7f))
* **api:** add missing input validation and rate-limit TODOs ([012c4b3](https://github.com/easingthemes/ki-bundestag/commit/012c4b3518a5291874bcfaf759e9d803e15a09e0))
* **api:** add runtime guards for unsafe type assertions in mappers and routes ([de2fdd9](https://github.com/easingthemes/ki-bundestag/commit/de2fdd973da24db770fa56379b38df4533da4017))
* **api:** extract hardcoded validation limits into shared constants ([32330d7](https://github.com/easingthemes/ki-bundestag/commit/32330d78a9b757ce71f9a6f6567663bd0fab10cc))
* **api:** replace empty catch blocks with console.error logging ([da175c8](https://github.com/easingthemes/ki-bundestag/commit/da175c8bcb7333b28aac7c1619273ecd4978d980))
* blank page after joining party ([#024](https://github.com/easingthemes/ki-bundestag/issues/024)) ([7c71e57](https://github.com/easingthemes/ki-bundestag/commit/7c71e579904c8ad0f229ec5d80763c0a83eef731))
* **deps:** resolve npm audit vulnerabilities via package.json updates ([9698217](https://github.com/easingthemes/ki-bundestag/commit/96982172b8cc715a1876f98c0ec9a8b5e9eed921))
* dynamic step-based progress that adapts to day type ([35d529e](https://github.com/easingthemes/ki-bundestag/commit/35d529ec95ad7b503b7748f2a4b8b0fef080976e))
* **engine+web:** translate all DB event strings to German + add EVENT_TYPE_LABEL map ([f9c43ef](https://github.com/easingthemes/ki-bundestag/commit/f9c43ef727759da8c8a81f16c659758fbe71f0a8))
* **engine:** add database indexes for hot query paths ([13a3c12](https://github.com/easingthemes/ki-bundestag/commit/13a3c129baeecb817590e1dbc02b16fa466a3124))
* **engine:** prevent seat double-assignment via transaction and unique index ([5321023](https://github.com/easingthemes/ki-bundestag/commit/5321023723abd8b8e0405bfb4bcd58d935293ba7))
* **engine:** standardize console log format with [MODULE] prefixes ([c1a4ba4](https://github.com/easingthemes/ki-bundestag/commit/c1a4ba4cb0d15fc012026b5a6e7e39fe3ddfaf57))
* ensure session is saved before OAuth redirect to prevent blank state on first login ([aa33720](https://github.com/easingthemes/ki-bundestag/commit/aa337209da35b10fb3b9f3551386b82a247543e3))
* harden API security — helmet, rate limiting, logger, timing-safe admin auth ([037e75e](https://github.com/easingthemes/ki-bundestag/commit/037e75e7588434663a940fb99993eb8991ab7412))
* increase batch API timeout and add slow-batch monitoring ([97b7a35](https://github.com/easingthemes/ki-bundestag/commit/97b7a35dabecbb80746063115e3da46190fd2c44)), closes [#10](https://github.com/easingthemes/ki-bundestag/issues/10) [#038](https://github.com/easingthemes/ki-bundestag/issues/038)
* increase sim status running timeout from 5min to 15min ([2e60e21](https://github.com/easingthemes/ki-bundestag/commit/2e60e214c42b1d2f56e1f3601c0b0be9145b28dd))
* mobile responsive layout across all pages ([#005](https://github.com/easingthemes/ki-bundestag/issues/005)) ([5244b15](https://github.com/easingthemes/ki-bundestag/commit/5244b1521cf42862d5c3d5951208808c5d89bcbd))
* prevent startup crash when SESSION_SECRET unset, scope rate limiters to POST ([99b1d77](https://github.com/easingthemes/ki-bundestag/commit/99b1d7754020dd886def6f6d1d5dd5416111f10d))
* remove duplicate PROGRESS.md casing from git index ([885383d](https://github.com/easingthemes/ki-bundestag/commit/885383dee1d35fa9888d8f7bf7f72036b6d00ade))
* resolve duplicate 'now' variable in loop.ts causing typecheck failure ([78a15a0](https://github.com/easingthemes/ki-bundestag/commit/78a15a0d13c7cedd60e8a2435fbc3ed49a51029a))
* resolve progress bar 95% stall and sidejobs step misplacement ([2192856](https://github.com/easingthemes/ki-bundestag/commit/2192856bc465ea055f35037d71f1710b2ad36990))
* **skills:** quote bracket argument-hint values for valid YAML ([4580cb7](https://github.com/easingthemes/ki-bundestag/commit/4580cb708f53b1067987646d324a46b53ad08890))
* sync header and dashboard status icon state derivation ([15691ca](https://github.com/easingthemes/ki-bundestag/commit/15691cabf0a5a97d06210323c9afded66fbc4f78))
* trust proxy for secure cookies behind Caddy reverse proxy ([441cfbf](https://github.com/easingthemes/ki-bundestag/commit/441cfbf65da14f5be82bf954ff4944f139c12432))
* update timing docs and web pages with realistic batch API estimates ([75050a5](https://github.com/easingthemes/ki-bundestag/commit/75050a5e49d93d99518373a2f84344521e4ec777))
* use preset-aware duration for header progress bar ([ca4d0af](https://github.com/easingthemes/ki-bundestag/commit/ca4d0afed53734fd51239835bd49885e2992a600))
* **web:** fix remaining English strings in CalendarWidget, PartyBillsList, error messages ([a312899](https://github.com/easingthemes/ki-bundestag/commit/a312899e8c551370d33498abc48cab88b472f8f9))
* **web:** replace bare empty state text with EmptyState component in key pages ([a1d49bb](https://github.com/easingthemes/ki-bundestag/commit/a1d49bb16e4d1a6708b67a12caf010663479dff2))
* **web:** replace bare loading text with LoadingSkeleton in key pages ([e86a0b3](https://github.com/easingthemes/ki-bundestag/commit/e86a0b3232c09f07670b3f1f2601c7ad0441bbf8))
* **web:** replace external image services with local CSS components ([82f047d](https://github.com/easingthemes/ki-bundestag/commit/82f047dc2b4b69c2df74eababfa5ea78dbc7768a))
* **web:** translate admin ModelConfig + ActionsReference to German ([0c399a8](https://github.com/easingthemes/ki-bundestag/commit/0c399a8588f86facf2689a7772cad70eccd3629b))
* **web:** translate all user-facing English strings to German ([04916c0](https://github.com/easingthemes/ki-bundestag/commit/04916c0c50d277cae96d500e3a6d93b926a3fad2))
* **web:** translate remaining English fallbacks in AskPartyWidget and MdbBadge ([4ae1228](https://github.com/easingthemes/ki-bundestag/commit/4ae1228c4be47ce33dac2b3aeacd7317694ee15a))
* **web:** use fetcherRef pattern to fix hook dependency warnings ([b968836](https://github.com/easingthemes/ki-bundestag/commit/b968836ddee000bbecf31c6e04864bc85ecc481f))


### Features

* adaptive batch polling ([#034](https://github.com/easingthemes/ki-bundestag/issues/034)) and media sentiment diversity ([#035](https://github.com/easingthemes/ki-bundestag/issues/035)) ([85b3f02](https://github.com/easingthemes/ki-bundestag/commit/85b3f02c46879893103c4b04ed61a3419d6bd5ab))
* add AI call cost tracking with live dashboard ([9136502](https://github.com/easingthemes/ki-bundestag/commit/9136502503ed11c9d0a6e656496e17b2fba93d5f)), closes [#030](https://github.com/easingthemes/ki-bundestag/issues/030)
* add configurable log lines, cost-report and simulate-errors to server-status workflow ([e781f27](https://github.com/easingthemes/ki-bundestag/commit/e781f27abb61c6de039d52fd7ee758f4e40421fd))
* add Impressum and Datenschutz (privacy policy) pages ([f1dc997](https://github.com/easingthemes/ki-bundestag/commit/f1dc997055ce71c71b21ed27efbf9ef904878c9e))
* add MdB profiles & listing (Group 1 implementation) ([02c20de](https://github.com/easingthemes/ki-bundestag/commit/02c20def67f1ff260511fe4b3d6b32464f19739a))
* add semantic-release pipeline with release-gated deploys ([96a750e](https://github.com/easingthemes/ki-bundestag/commit/96a750e0aa0b9d086f025276a55be9cf5610ca67))
* add timing/cost/error analytics to sim logs and GH workflows ([083fc44](https://github.com/easingthemes/ki-bundestag/commit/083fc443426cfd42a52058dd6cfa4ad15c13979c))
* add workflow to update .env on server remotely ([b7a7d1f](https://github.com/easingthemes/ki-bundestag/commit/b7a7d1f8b3662e5d7b7bb24e2064985f700d2b1e))
* allow users to change display name ([#023](https://github.com/easingthemes/ki-bundestag/issues/023)) ([dd5f75b](https://github.com/easingthemes/ki-bundestag/commit/dd5f75b863aff5cad623d399a36bf6a0f04ed808))
* close [#013](https://github.com/easingthemes/ki-bundestag/issues/013) — replace admin pages with GH workflows + public info ([fb382bf](https://github.com/easingthemes/ki-bundestag/commit/fb382bff3a404f7192e245b3379edcce9c7c7263))
* close [#016](https://github.com/easingthemes/ki-bundestag/issues/016), [#017](https://github.com/easingthemes/ki-bundestag/issues/017), [#021](https://github.com/easingthemes/ki-bundestag/issues/021) — add tests, linting, and FK constraints ([d4a7008](https://github.com/easingthemes/ki-bundestag/commit/d4a70085fcf44f20f200022efb6f776c7c788070))
* database split + multi-provider AI integration ([91c1976](https://github.com/easingthemes/ki-bundestag/commit/91c19765662b5cef058bd6f6d8a246ea814fac82))
* **engine:** add configurable context depth (low/normal/high) ([147141f](https://github.com/easingthemes/ki-bundestag/commit/147141f66125153f314f7e2c99f2de781ac6f3e6))
* **engine:** deep abgeordnetenwatch API integration ([#031](https://github.com/easingthemes/ki-bundestag/issues/031)) ([a0c527d](https://github.com/easingthemes/ki-bundestag/commit/a0c527d9dd37e1250234805f735a55e6043d5bbb))
* Group 5 — Citizen Q&A Enhancement ([f31a1bb](https://github.com/easingthemes/ki-bundestag/commit/f31a1bb8f1a320ef7c6916b535895c3cb1afd237))
* Group 6 — Transparency & Matching Tools ([ec914f8](https://github.com/easingthemes/ki-bundestag/commit/ec914f8788ff992b7165d9d3acf2de6fad4ce6b9))
* heartbeat-based sim status instead of hardcoded timeout ([f04e43f](https://github.com/easingthemes/ki-bundestag/commit/f04e43fad5bb9add72fe7e99fe80bb41f9209937))
* implement committee system (Group 2 abgeordnetenwatch roadmap) ([f03dab7](https://github.com/easingthemes/ki-bundestag/commit/f03dab77abbe892008e695604ba94b4c36db2c5b))
* implement context & memory management for long-running simulations ([e57b808](https://github.com/easingthemes/ki-bundestag/commit/e57b808f22636bd600c3fde0ed651243b83db0eb))
* implement OAuth authentication with Google and GitHub ([#001](https://github.com/easingthemes/ki-bundestag/issues/001)) ([4c6402a](https://github.com/easingthemes/ki-bundestag/commit/4c6402af2047bfccb6b45c5118d8922db9426c21)), closes [#022](https://github.com/easingthemes/ki-bundestag/issues/022)
* implement side jobs & scandals system (Group 3 abgeordnetenwatch roadmap) ([8e44d09](https://github.com/easingthemes/ki-bundestag/commit/8e44d09b92eaca9fa3d4ae063b459ae403fc1f9a))
* persist day summaries with history, preview, and backfill ([7b577fd](https://github.com/easingthemes/ki-bundestag/commit/7b577fd6492a3e25329e60ba381f6a02045e6806))
* progressive summarization with case facts preservation ([9ce1d96](https://github.com/easingthemes/ki-bundestag/commit/9ce1d96b875b75c2847c53638f5ebe7ff428e352))
* real server-side day progress instead of fake time-based estimate ([63eb70d](https://github.com/easingthemes/ki-bundestag/commit/63eb70db34cc6116f688e73f4fd60a9129bddbf0))
* real server-side progress for header day progress bar ([98bd8c9](https://github.com/easingthemes/ki-bundestag/commit/98bd8c93056c457449d3fb1e9869a77db9aa7818))
* semantic retry-with-feedback loop for party agent validation ([543ad4c](https://github.com/easingthemes/ki-bundestag/commit/543ad4cd301337c66de92f4512000c658939c4f3))
* tune presidential veto rate ([#036](https://github.com/easingthemes/ki-bundestag/issues/036)) and add parse-fail retry ([#033](https://github.com/easingthemes/ki-bundestag/issues/033)) ([1640e97](https://github.com/easingthemes/ki-bundestag/commit/1640e974ed4c74fcbf2153ce993c935b757bd9fe))
* **web:** add cost matrix table (preset × depth × users per real month) ([eb2f29a](https://github.com/easingthemes/ki-bundestag/commit/eb2f29a348d7617b64328fda8597d8885f260ca6))
* **web:** add error state to useApiData hook ([b7e7d53](https://github.com/easingthemes/ki-bundestag/commit/b7e7d538435fd647e07f888978c2f515716f4e86))
* **web:** add input token scaling comparison table to costs page ([1276a82](https://github.com/easingthemes/ki-bundestag/commit/1276a823a2c6ede03f665cbb76b5656d4803eacf))
* **web:** add LoadingSkeleton and EmptyState shared components ([f60b9d0](https://github.com/easingthemes/ki-bundestag/commit/f60b9d0871c830e7f72448112b318e6c6f2d5d3a))
