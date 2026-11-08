-- Rome Pay schema. Idempotent: safe to run on every deploy (npm run db:migrate).
-- Addresses are stored lowercase 0x hex. Token amounts are wUSDC base units (6 decimals).

create table if not exists merchants (
  address     text primary key,
  name        text not null default '',
  created_at  timestamptz not null default now()
);

create table if not exists sessions (
  token_hash  text primary key,            -- sha256 of the cookie token; the token itself is never stored
  address     text not null references merchants(address) on delete cascade,
  expires_at  timestamptz not null,
  created_at  timestamptz not null default now()
);
create index if not exists sessions_expires_idx on sessions (expires_at);

create table if not exists invoices (
  id          text primary key,            -- public link id, /pay/<id>
  merchant    text not null references merchants(address),
  ref         text not null unique,        -- bytes32 emitted in PayRouter.Paid
  amount      numeric(38, 0),              -- null = open amount, the payer enters it
  memo        text not null default '',
  reusable    boolean not null default false,
  status      text not null default 'open' check (status in ('open', 'paid', 'archived')),
  created_at  timestamptz not null default now(),
  paid_at     timestamptz
);
create index if not exists invoices_merchant_idx on invoices (merchant, created_at desc);

-- Every Paid event of the router, matched to an invoice by ref when one exists.
create table if not exists payments (
  tx_hash       text not null,
  log_index     integer not null,          -- position among the router's Paid events in the tx (0, 1, ...), not the RPC logIndex
  block_number  bigint not null,
  block_time    timestamptz,
  ref           text not null,
  invoice_id    text references invoices(id),
  merchant      text not null,
  payer         text not null,
  amount        numeric(38, 0) not null,   -- gross amount the payer sent
  fee           numeric(38, 0) not null,   -- part of amount that went to the treasury
  created_at    timestamptz not null default now(),
  primary key (tx_hash, log_index)
);
create index if not exists payments_merchant_idx on payments (merchant, block_number desc);
create index if not exists payments_ref_idx on payments (ref);
create index if not exists payments_block_idx on payments (block_number desc);

-- Log scan cursor per router: the last block whose Paid events are stored.
-- Also holds one-off migration markers (key 'migration:...').
create table if not exists sync_state (
  key         text primary key,
  block       bigint not null,
  updated_at  timestamptz not null default now()
);

-- Solana sign-in: a Solflare merchant's address is the Rome synthetic of this pubkey (base58).
alter table merchants add column if not exists solana_pubkey text unique;

-- Payment notifications. The webhook secret signs every delivery (HMAC-SHA256), so it is stored
-- as is; the Telegram code is a one-time, short-lived token for the bot's /start deep link.
alter table merchants add column if not exists webhook_url text;
alter table merchants add column if not exists webhook_secret text;
alter table merchants add column if not exists telegram_chat_id bigint;
alter table merchants add column if not exists telegram_code text unique;
alter table merchants add column if not exists telegram_code_expires timestamptz;

-- Outbox: one row per payment and channel, queued when the payment is first stored.
create table if not exists notifications (
  id               bigserial primary key,
  merchant         text not null references merchants(address) on delete cascade,
  channel          text not null check (channel in ('webhook', 'telegram')),
  tx_hash          text not null,
  log_index        integer not null,
  status           text not null default 'pending' check (status in ('pending', 'sent', 'failed')),
  attempts         integer not null default 0,
  next_attempt_at  timestamptz not null default now(),
  response_status  integer,
  last_error       text,
  sent_at          timestamptz,
  created_at       timestamptz not null default now(),
  unique (channel, tx_hash, log_index)
);
create index if not exists notifications_due_idx on notifications (next_attempt_at) where status = 'pending';
create index if not exists notifications_merchant_idx on notifications (merchant, created_at desc);

-- One-off fix, 2026-11-08: rows stored before log_index meant "position in tx" used the RPC logIndex,
-- which differs between receipts and eth_getLogs on Rome, so one event could be stored twice.
-- Drop the copies, renumber, then set the marker so this never runs again.
delete from payments a using payments b
where a.tx_hash = b.tx_hash and a.log_index > b.log_index
  and a.ref = b.ref and a.merchant = b.merchant and a.payer = b.payer and a.amount = b.amount and a.fee = b.fee
  and not exists (select 1 from sync_state where key = 'migration:payments-ordinal');

update payments p set log_index = r.ordinal
from (
  select tx_hash, log_index, (row_number() over (partition by tx_hash order by log_index) - 1)::int as ordinal
  from payments
) r
where p.tx_hash = r.tx_hash and p.log_index = r.log_index and p.log_index <> r.ordinal
  and not exists (select 1 from sync_state where key = 'migration:payments-ordinal');

insert into sync_state (key, block) values ('migration:payments-ordinal', 0) on conflict (key) do nothing;

-- Added 2026-11-08: single-use sign-in nonces and a fixed-window rate limiter.
create table if not exists auth_nonces (
  nonce       text primary key,
  expires_at  timestamptz not null
);
create index if not exists auth_nonces_expires_idx on auth_nonces (expires_at);

create table if not exists rate_limits (
  key           text not null,
  window_start  timestamptz not null,
  hits          integer not null default 0,
  primary key (key, window_start)
);
create index if not exists rate_limits_window_idx on rate_limits (window_start);
