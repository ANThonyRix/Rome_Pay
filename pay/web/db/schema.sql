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
  log_index     integer not null,
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
create table if not exists sync_state (
  key         text primary key,
  block       bigint not null,
  updated_at  timestamptz not null default now()
);
