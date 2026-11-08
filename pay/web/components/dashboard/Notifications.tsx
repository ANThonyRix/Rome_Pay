"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState } from "react";
import {
  connectTelegramAction,
  disconnectTelegramAction,
  rotateSecretAction,
  saveWebhookAction,
  sendTestAction,
  type NotifyState,
} from "@/app/dashboard/notify-actions";
import d from "./dashboard.module.css";

interface Props {
  webhookUrl: string | null;
  webhookSecret: string | null;
  telegramConnected: boolean;
  telegramAvailable: boolean;
}

/** Payment notifications: a Telegram chat and a signed webhook. */
export default function Notifications(props: Props) {
  return (
    <div className={d.channels}>
      <TelegramPanel connected={props.telegramConnected} available={props.telegramAvailable} />
      <WebhookPanel url={props.webhookUrl} secret={props.webhookSecret} />
    </div>
  );
}

function Status({ state, idle }: { state: NotifyState; idle?: React.ReactNode }) {
  return (
    <p className={state.error ? d.error : d.note} aria-live="polite">
      {state.error ?? state.ok ?? idle}
    </p>
  );
}

const POLL_MS = 3000;
const POLL_FOR_MS = 15 * 60 * 1000; // the connect code lives 15 minutes

function TelegramPanel({ connected, available }: { connected: boolean; available: boolean }) {
  const router = useRouter();
  const [connect, connectAction, connecting] = useActionState<NotifyState>(connectTelegramAction, {});
  const [test, testAction, testing] = useActionState<NotifyState, FormData>(sendTestAction, {});

  // While the merchant presses Start in Telegram, refresh until the server sees the chat.
  const waiting = Boolean(connect.link) && !connected;
  useEffect(() => {
    if (!waiting) return;
    const started = Date.now();
    const timer = setInterval(() => {
      if (Date.now() - started > POLL_FOR_MS) clearInterval(timer);
      else router.refresh();
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [waiting, router]);

  return (
    <section className={d.channel} aria-labelledby="telegram-title">
      <div className={d.channelHead}>
        <h3 id="telegram-title" className={d.label}>
          Telegram
        </h3>
        <span className={d.status} data-status={connected ? "paid" : "archived"}>
          {connected ? "Connected" : "Off"}
        </span>
      </div>
      <p className={d.channelText}>A message in your chat for every payment: amount, what it was for, and the receipt.</p>

      {!available ? (
        <p className={d.note}>Telegram is not set up on this deployment yet.</p>
      ) : connected ? (
        <>
          <div className={d.channelActions}>
            <form action={testAction}>
              <input type="hidden" name="channel" value="telegram" />
              <button className={d.secondary} type="submit" disabled={testing}>
                {testing ? "Sending" : "Send test"}
              </button>
            </form>
            <form action={disconnectTelegramAction}>
              <button className={d.textButton} type="submit">
                Disconnect
              </button>
            </form>
          </div>
          <Status state={test} />
        </>
      ) : waiting ? (
        <>
          <a className={d.secondary} href={connect.link} target="_blank" rel="noreferrer">
            Open Telegram
          </a>
          <p className={d.note} aria-live="polite">
            Press Start in the bot. This page updates when it connects. The link works for 15 minutes.
          </p>
        </>
      ) : (
        <>
          <form action={connectAction}>
            <button className={d.secondary} type="submit" disabled={connecting}>
              {connecting ? "Preparing link" : "Connect Telegram"}
            </button>
          </form>
          <Status state={connect} />
        </>
      )}
    </section>
  );
}

function WebhookPanel({ url, secret }: { url: string | null; secret: string | null }) {
  const [save, saveAction, saving] = useActionState<NotifyState, FormData>(saveWebhookAction, {});
  const [rotate, rotateAction, rotating] = useActionState<NotifyState>(rotateSecretAction, {});
  const [test, testAction, testing] = useActionState<NotifyState, FormData>(sendTestAction, {});
  const [shown, setShown] = useState(false);
  const [copied, setCopied] = useState(false);
  const [confirmRotate, setConfirmRotate] = useState(false);

  const copySecret = async () => {
    if (!secret) return;
    try {
      await navigator.clipboard.writeText(secret);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setShown(true);
    }
  };

  return (
    <section className={d.channel} aria-labelledby="webhook-title">
      <div className={d.channelHead}>
        <h3 id="webhook-title" className={d.label}>
          Webhook
        </h3>
        <span className={d.status} data-status={url ? "paid" : "archived"}>
          {url ? "On" : "Off"}
        </span>
      </div>
      <p className={d.channelText}>
        Your server gets a signed POST for every payment, so orders can be marked paid without anyone checking the
        dashboard.
      </p>

      <form className={d.field} action={saveAction}>
        <label className={d.label} htmlFor="webhook-url">
          Address
        </label>
        <span className={d.inline}>
          <input
            id="webhook-url"
            className={d.input}
            name="url"
            type="url"
            inputMode="url"
            defaultValue={url ?? ""}
            placeholder="https://your-site.com/rome-pay"
            maxLength={500}
            spellCheck={false}
          />
          <button className={d.secondary} type="submit" disabled={saving}>
            {saving ? "Saving" : "Save"}
          </button>
        </span>
        <Status state={save} />
        {url ? (
          <button className={`${d.textButton} ${d.danger}`} type="submit" name="remove" value="1" disabled={saving}>
            Remove webhook
          </button>
        ) : null}
      </form>

      {url && secret ? (
        <>
          <div className={d.field}>
            <span className={d.label}>Signing secret</span>
            <code className={d.secret}>{shown ? secret : `whsec_${"•".repeat(16)}`}</code>
            <div className={d.channelActions}>
              <button className={d.textButton} type="button" onClick={() => setShown((v) => !v)} aria-pressed={shown}>
                {shown ? "Hide" : "Show"}
              </button>
              <button className={d.textButton} type="button" onClick={copySecret} aria-live="polite">
                {copied ? "Copied" : "Copy"}
              </button>
              {confirmRotate ? (
                <form action={rotateAction} className={d.confirm}>
                  <button className={`${d.textButton} ${d.danger}`} type="submit" disabled={rotating}>
                    {rotating ? "Making" : "Make new secret"}
                  </button>
                  <button className={d.textButton} type="button" onClick={() => setConfirmRotate(false)}>
                    Keep
                  </button>
                </form>
              ) : (
                <button className={d.textButton} type="button" onClick={() => setConfirmRotate(true)}>
                  Rotate
                </button>
              )}
            </div>
            <Status state={rotate} idle={
                <>
                  Each request carries <code className={d.mono}>rome-pay-signature: t=…,v1=…</code>, an HMAC-SHA256 of{" "}
                  <code className={d.mono}>t.body</code> with this secret. Check it before you trust the payment.
                </>
              }
            />
          </div>
          <form action={testAction} className={d.field}>
            <input type="hidden" name="channel" value="webhook" />
            <button className={d.secondary} type="submit" disabled={testing}>
              {testing ? "Sending" : "Send test event"}
            </button>
            <Status state={test} />
          </form>
        </>
      ) : null}
    </section>
  );
}
