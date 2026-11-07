# Building on Rome — план участия в программе билдеров

Дата исследования: 2026-11-06. Источники: docs.rome.builders, rome.builders/apps, rome.builders/ideas, arena.mainnet.romeprotocol.xyz (+ /dashboard), пост @RomeProtocol от 2026-11-04, прямые запросы к RPC Rubicon и Bridge API.

---

## 1. Что такое Rome (коротко)

- Rome запускает EVM-цепочки **внутри Solana-программы**. Solidity-контракт может в той же транзакции вызвать Solana-программу (CPI), а Solana-кошелёк может вызвать EVM-контракт. Слоган: "EVM and Solana — one market".
- Главная фишка — **dual-lane app**: одна деплой-копия, одно состояние, одна ликвидность для MetaMask и для Solana-кошельков.
- 6 официальных use case'ов (Academy, урок 2), по убыванию силы:
  1. Solidity-приложения, использующие ликвидность и программы Solana (CPI).
  2. Одно приложение для обоих типов кошельков (dual-lane).
  3. Solana-программы, открытые EVM-пользователям.
  4. Активы и пользователи из других сетей (встроенный Rome Bridge, CCTP).
  5. Permissioned RWA на обеих "полосах".
  6. Своя цепочка со своим газ-токеном (App Sovereignty), это последний шаг, а не первый.

### Сети

| | Hadrian (testnet) | Rubicon (mainnet) |
|---|---|---|
| Chain ID | `200010` | `7531` |
| RPC | `https://hadrian.testnet.romeprotocol.xyz/` | `https://rubicon.mainnet.romeprotocol.xyz/` (WS на том же хосте) |
| Explorer | via-hadrian.testnet.romeprotocol.xyz | via-rubicon.mainnet.romeprotocol.xyz |
| Verify | — | `https://verify.mainnet.romeprotocol.xyz` |
| Газ | USDC (Solana Devnet USDC через бридж) | **реальный USDC**, 18 decimals на EVM-стороне |
| Цена газа (замер в доках) | ~10.4 gwei | ~104.6 gwei, меняется |

- Фаусета Rome нет. На Hadrian: USDC с faucet.circle.com (Solana Devnet или Sepolia), дальше через Rome Bridge. Минимум 0.5–1 USDC газа.
- На Rubicon вход через Bridge: USDC по CCTP из Ethereum, Base, Arbitrum, Polygon, Avalanche, Monad, OP, плюс SOL/USDC из Solana. ETH-маршрута нет. Живой список маршрутов: `https://bridge-api.mainnet.romeprotocol.xyz/v1/routes`.

### Стоимость операций (важно для экономики продуктов)

Запись дорогая, потому что газ уходит на создание Solana-аккаунтов. Пересчёт замеров с Hadrian по цене Rubicon ~104.6 gwei:

| Операция | Газ | ≈ USDC на Rubicon |
|---|---|---|
| Нативный перевод на **новый** адрес | 1,086,961 | ~0.11 |
| Нативный перевод на существующий адрес | 10,001 | ~0.000001 |
| wUSDC перевод на **новый** адрес | 2,544,921 | ~0.27 |
| Деплой маленького контракта | 1,147,921 | ~0.12 |
| Деплой quickstart-контракта (без оптимизатора) | ~14M | ~1.5 |

Вывод: первое касание нового адреса стоит дорого, повторные операции почти бесплатны. Всегда `eth_estimateGas`, никогда не хардкодить 21000.

### Ограничения, которые влияют на выбор идей

- Нет `SELFDESTRUCT`. Неподдерживаемый opcode абортит всю транзакцию.
- Нет gas stipend (2300), поэтому защита через `transfer()/send()` не работает. Нужны явные reentrancy guards.
- ~1.4M CU на атомарную транзакцию; CPI depth ≤ 4; 256 storage slots на storage-аккаунт.
- **Нет `debug_traceTransaction` / `trace_*`.** Есть только `debug_traceRomeTransaction` для batch-транзакций.
- `eth_getLogs` ограничен по диапазону (ошибка `-32005`).
- Блоки = слоты Solana. Номер блока на Rubicon ~465M, большинство блоков пустые. Сканировать цепочку "в лоб" дорого.
- **У Via Explorer нет публичного API** (это SPA; `/api/v2/*` пустой, `/api?module=` отдаёт HTML). Индексатора и сабграфов для Rome нет. Это пробел в экосистеме.
- Полезные Rome-методы: `rome_solanaTxForEvmTx` (связь EVM-tx и Solana-tx), `rome_emulateTx`, `rome_emulateCallAccounts`, `rome_mintId`.
- Solana-lane требует кошелёк, который подписывает **Solana v1 транзакции**. На Hadrian это умеет Solflare, **Phantom пока нет**.
- Oracle Gateway: только `latestRoundData()`, без истории. Не аудирован (preview).
- Модель с одним оператором (payer pool), без децентрализованного набора операторов.

### Стек разработчика (официальный)

- `rome-registry` — живые факты о цепочках. Rubicon есть начиная с **v0.3.0**. Не browser-safe (читает `node:fs`): на клиенте нужно проецировать в статический JSON при сборке.
- `rome-sdk-ts` v0.4.0 — `submitRomeTx`, `submitRomeTxV1` (Solana-кошелёк), CPI-энкодеры, `/bridge` клиент.
- `rome-solidity` — интерфейсы precompile: CPI `0xFF…08`, Helper `0xFF…09`, Withdraw `0x42…16`, System `0xFF…07`; SPL↔ERC-20 обёртки; адаптеры оракулов.
- `create-rome-app` — scaffold dual-lane приложения. **Подвох:** он и `rome-cli` закреплены на registry v0.2.0, где нет Rubicon. Для mainnet значения нужно вписывать вручную.
- Пакеты **не опубликованы в npm**, ставятся с GitHub: `npm install github:rome-protocol/rome-sdk-ts#v0.4.0`.
- Hardhat 3 + viem (quickstart), Foundry (`forge script` нужен `--skip-simulation`).
- Референс-приложения: rome-dex, aerarium, cardo, appia, rome-aave-v3-demo. В каждом репо есть `AGENTS.md`.

---

## 2. Arena — как работает программа

- Запущена **2026-11-04**. Две роли: **Builder** (регистрирует приложение, привязывает контракты) и **Ambassador** (ивенты, воркшопы, посты в X, приведённые билдеры). Обе роли получают **Laurels**, "records of activity". Laurels видны в Civitas.
- Вход: Sign in кошельком или email → "Put your app in the Arena" (`/apps/new`, можно с `?idea=<название>` из rome.builders/ideas).
- **Майлстоуны приложения:** 1 Registered → 2 Planned → 3 Built on testnet → 4 Used on testnet → 5 Audited → 6 Live on mainnet → 7 First mainnet users → 8 The ranks.
- **Ранги:** Legionary → Patrician → Pontifex Maximus. Пороги по **пользователям или TVL плюс транзакции**. Точные цифры публично не указаны.
- **Гранты не автоматические.** Подать можно, когда приложение построено на testnet. Решение и сумму Rome определяет индивидуально.
- Страница приложения в Arena: сайт, GitHub, "What we're building", привязанные контракты, текущий майлстоун.

### Состояние Arena на 2026-11-06 (dashboard)

- Builders: **9**, Ambassadors: 55, Apps registered: 9, в галерее: 2, **live on mainnet: 0**.
- Testnet-транзакций с 2 ноября: 1,673.
- Приложения в галерее: Rome Gladiator Vault, Janus (BTC up/down, EVM vs Solana), Yield Port (ERC-4626 vault + CPI), HIREhub, Teller, rew.

**Вывод:** конкуренция пока минимальная. Окно для ранних билдеров открыто, и первые приложения на Rubicon будут заметны.

### Что уже есть у Rome (не дублировать)

- Mainnet: Portus (лендинг Kamino из EVM), Rome Bridge, Via Explorer, Oracle Gateway, Under the Ticker, Civitas (Laurels по кошелькам), Arena.
- Testnet: Solgate, Bloom (RWA), Rome DEX, Cardo, Appia, Aerarium (Compound v3), Aave v3, Teller, Rome App (wrap/swap/LP/bridge), Sovereign Portal, Ostia (Canton).
- Список идей Rome (rome.builders/ideas) уже содержит среди прочего: Two-Sided Analytics, Stalk In (мониторинг), USDC Payments, Wallet Dashboard, Token Rewards, Identity Manager, Treasury Router. Это не минус: Rome **сам хочет** эти продукты, но никто их пока не построил.

### Токен / TGE

- На 2026-11-06 у Rome **нет анонсированного токена и аирдропа** (по сайту и докам; solanacompass, октябрь 2026). Laurels — записи активности, а не обещанные токены.
- Поэтому стратегия "полезный продукт, который живёт на mainnet" правильная независимо от TGE. Не закладывать в план доход от аирдропа.

---

## 3. Стратегия

1. **Один продукт с on-chain метриками** (пользователи, транзакции, объём на Rubicon). Только такие двигают ранги в Arena. Кандидат №1: **Rome Pay + Claim Links** (см. ideas.md).
2. **Один инфраструктурный продукт на сильных сторонах** (RPC, индексация, Telegram, аналитика). Кандидат: **Rome Index → Watch + Pulse + API**. Закрывает реальный пробел (у Via нет API, индексатора нет). Это путь к гранту и признанию команды, но ранги по TVL он сам не даёт. Чтобы были on-chain следы, нужна платная подписка в USDC на Rubicon.
3. Быстрые победы для видимости: маленький, но живой инструмент (например, Approvals/Revoke для Rome), чтобы раньше всех попасть в "Live on mainnet".

Порядок (решение 2026-11-06): **первым Rome Pay**. Для старта ему хватает listener'а событий своего контракта. Потом Watch на том же listener'е, дальше он вырастает в полный индексатор. Объём работ Pay v1–v3: ideas.md, часть 3.

---

## 4. План по фазам

### Фаза 0 — подготовка (1–2 дня)
- [ ] Отдельный кошелёк для разработки (MetaMask) + **Solflare** для Solana-lane. Phantom не подходит, не подписывает v1.
- [ ] Получить Devnet USDC (Circle faucet) + devnet SOL → Rome Bridge → Hadrian. Минимум 1 USDC газа.
- [ ] Аккаунты: GitHub (публичные репо), X (пост-аккаунт билдера), Discord Rome, Telegram RomeCommunity.
- [ ] Sign in в Arena. Выбрать роль Builder (позже можно и Ambassador).
- [ ] `git init` в этом проекте, структура монорепо.

### Фаза 1 — обучение (2–4 дня)
- [ ] Quickstart: задеплоить HelloRome на Hadrian, найти tx в Via и перейти по "Settled in".
- [ ] Rome Academy, уроки 1–12. Обязательно: 5 (CPI), 6 (токены), 7 (Solana-кошельки), 9 (dual-lane), 10 (из других сетей), 11 (на Rubicon).
- [ ] Прочитать `AGENTS.md` и код `cardo`, `rome-dex`, `create-rome-app`.
- [ ] Прогнать `create-rome-app` и проверить оба lane.
- [ ] Записать подвохи в Memory.md.

### Фаза 2 — выбор идеи и регистрация (1 день)
- [ ] Финально выбрать 1–2 идеи из ideas.md.
- [ ] Зарегистрировать приложение в Arena (майлстоун 1 Registered). Если идея есть в списке Rome, регистрировать через `?idea=`.
- [ ] Написать краткий план в описании (майлстоун 2 Planned): проблема, для кого, что on-chain.
- [ ] Первый пост в X: проблема + план.

### Фаза 3 — MVP на Hadrian (1–3 недели)
- [ ] Контракты: Hardhat 3 + viem + rome-solidity; тесты; reentrancy guards; без SELFDESTRUCT.
- [ ] Фронтенд: dual-lane (MetaMask + Solflare), registry-проекция в JSON, `submitRomeTx` / `submitRomeTxV1`.
- [ ] Встроенный Rome Bridge (`@rome-protocol/sdk/bridge`), чтобы пользователи заходили с Base/Arbitrum.
- [ ] Деплой, привязка контрактов в Arena (майлстоун 3 Built on testnet).
- [ ] Публичный GitHub: README, архитектура, адреса, как запустить. Можно `AGENTS.md` в стиле Rome.

### Фаза 3.5 — заявка на грант (сразу после Built on testnet)
- [ ] Условие: майлстоун 3 Built on testnet в Arena (раньше подать нельзя, гранты не автоматические).
- [ ] Уточнить в Discord Rome форму и канал подачи (форма в Arena, письмо или тикет в Discord).
- [ ] Собрать пакет заявки:
  - ссылка на страницу приложения в Arena;
  - проблема и почему это возможно только на Rome (dual-lane, CPI, встроенный бридж);
  - живое демо на Hadrian + видео 30–60 с;
  - публичный GitHub, адреса контрактов и транзакции в Via;
  - первые метрики testnet (кошельки EVM vs Solana, tx), если уже есть;
  - roadmap до Rubicon: Used on testnet → Audited → Live on mainnet, со сроками;
  - запрашиваемая сумма и на что: аудит, инфраструктура (RPC/сервер индексатора), газ на mainnet, время разработки;
  - как продукт живёт после гранта (монетизация).
- [ ] Подать заявку, сделать пост в X про testnet-релиз.
- [ ] Не ждать ответа: сразу продолжать Фазу 4. Решение Rome принимает индивидуально.

### Фаза 4 — пользователи на testnet (1–2 недели)
- [ ] Демо-видео (30–60 с) и треды в X с хэштегами и тегом @RomeProtocol.
- [ ] Позвать ambassador'ов и других билдеров Arena протестировать продукт (кросс-тестирование).
- [ ] Метрики: уникальные кошельки (EVM vs Solana), tx, объём. Показывать публично (тут помогает свой индексатор).
- [ ] Майлстоун 4 Used on testnet.

### Фаза 5 — аудит (параллельно с 4)
- [ ] Минимум: Slither/Aderyn + самостоятельный чек-лист под ограничения Rome (stipend, CU, CPI depth).
- [ ] По возможности недорогой внешний ревью или конкурс; уточнить в Discord, что Rome засчитывает как "Audited".
- [ ] Майлстоун 5 Audited.

### Фаза 6 — Rubicon mainnet
- [ ] Перенести адреса обёрток на Rubicon (Contract Addresses), registry v0.3.0+.
- [ ] Полный round trip с маленькой суммой реального USDC до анонса.
- [ ] Верифицировать контракты (`verify.mainnet.romeprotocol.xyz`).
- [ ] Обновить Arena (майлстоун 6 Live on mainnet), пост в X со ссылками на контракты в Via.
- [ ] Первые реальные пользователи (майлстоун 7).

### Фаза 7 — рост и ранги
- [ ] Регулярные апдейты в Arena и X (каждую неделю: метрики, что нового).
- [ ] Апдейт по гранту (или повторная заявка, если первая отклонена) с mainnet-цифрами.
- [ ] Монетизация: комиссия (Pay), платные тарифы (API/Watch).

---

## 5. Чек-лист артефактов на каждый продукт

1. Рабочий сайт (свой домен, mobile-friendly).
2. Публичный GitHub с исходниками, лицензией, README, адресами контрактов.
3. Описание проблемы: кому больно сейчас, почему это возможно только на Rome (one market, CPI, dual-lane).
4. Демо реальной работы: видео + живой URL + тестовые сценарии.
5. Контракты и транзакции в Via (Hadrian → Rubicon), верифицированные.
6. Посты в X: анонс, демо, метрики, mainnet-запуск.
7. Регистрация в Arena с регулярными апдейтами майлстоунов.
8. *(добавлено)* Метрики, доказывающие **новых** пользователей (EVM vs Solana кошельки, пришедшие через бридж из других сетей).
9. *(добавлено)* Поддержка обоих lane и встроенный бридж. Rome ценит это выше всего.
10. *(добавлено)* Страница статуса/безопасности: аудит, известные ограничения, как вывести средства.

---

## 6. Риски

- **TGE не гарантирован.** Продукт должен окупаться и без аирдропа.
- Высокая стоимость первого касания адреса (~0.11–0.27 USDC). Нужен UX, который это учитывает (sponsor, предсоздание аккаунтов).
- Solana-lane зависит от поддержки v1 в кошельках (Phantom пока нет).
- Один оператор сети и неаудированный Oracle Gateway — риски для DeFi-продуктов с TVL.
- Rome быстро меняет доки ("Testnet has been reforged"), адреса нужно брать только из registry.
- Сами Rome могут выпустить похожий продукт (Two-Sided Analytics и Stalk In есть в их списке идей). Это снижается скоростью выхода и связью с командой в Discord.

---

## 7. Ссылки

- Docs: https://docs.rome.builders (индекс: /llms.txt, любая страница + `.md`)
- Academy: https://docs.rome.builders/rome-academy
- Arena: https://arena.mainnet.romeprotocol.xyz · Dashboard: /dashboard · Новое приложение: /apps/new
- Ideas: https://www.rome.builders/ideas
- Apps: https://www.rome.builders/apps
- Civitas (Laurels): https://civitas.mainnet.romeprotocol.xyz/points
- GitHub: https://github.com/rome-protocol
- Bridge routes API: https://bridge-api.mainnet.romeprotocol.xyz/v1/routes
- X: https://x.com/RomeProtocol · Discord: https://discord.com/invite/vZ9rnCdNSB
