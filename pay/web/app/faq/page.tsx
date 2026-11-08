import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import SiteHeader from "@/components/SiteHeader";
import d from "@/components/dashboard/dashboard.module.css";
import f from "./faq.module.css";

export const metadata: Metadata = {
  title: "Questions and answers",
  description: "How Rome Pay works, in plain words: paying a link, getting paid, fees and safety.",
};

interface Item {
  q: string;
  a: ReactNode;
}

interface Group {
  title: string;
  items: Item[];
}

const GROUPS: Group[] = [
  {
    title: "The basics",
    items: [
      {
        q: "What is Rome Pay?",
        a: (
          <p>
            A simple way to get paid in USDC with a link. You create a link, send it to the person who owes you, or post it
            to collect donations. They open it, pay from their own wallet, and the money goes straight to your wallet.
          </p>
        ),
      },
      {
        q: "Is this real money?",
        a: (
          <p>
            Not yet. Rome Pay currently runs on a test network (Rome Hadrian). The USDC there is test money with no real
            value, so you can try every step for free. A real-money version on Rome mainnet is planned.
          </p>
        ),
      },
      {
        q: "What is Rome, and why does it matter to me?",
        a: (
          <p>
            Rome is a network that lets Ethereum wallets (like MetaMask) and Solana wallets (like Solflare) work with the
            same payments. That is why one Rome Pay link can be paid from either kind of wallet, and the merchant gets the
            same receipt both ways.
          </p>
        ),
      },
      {
        q: "Do I need to create an account?",
        a: (
          <p>
            No email, no password. If you are paying, you only connect your wallet. If you are getting paid, you sign in by
            signing a short message with your wallet. That signature is free and does not move any money.
          </p>
        ),
      },
    ],
  },
  {
    title: "Paying a link",
    items: [
      {
        q: "How do I pay?",
        a: (
          <ol>
            <li>Open the link you received. You will see who gets paid, how much, and what it is for.</li>
            <li>Pick your wallet: MetaMask or Solflare.</li>
            <li>Connect it, then press the button on the page. Confirm each step in your wallet.</li>
            <li>When the last step is done, you get a receipt link you can open in the block explorer.</li>
          </ol>
        ),
      },
      {
        q: "Which wallets can I pay with?",
        a: (
          <p>
            MetaMask (the page adds the Rome network for you) and Solflare (set it to Devnet while Rome Pay is on the test
            network). You need the wallet extension installed in your browser.
          </p>
        ),
      },
      {
        q: "Why do I have to confirm more than once?",
        a: (
          <>
            <p>
              Your first payment needs a few one-time setup steps. Each one is a separate confirmation in your wallet, and
              the page shows the next one for you:
            </p>
            <ul>
              <li>
                <strong>Open Rome account / Move USDC to Rome.</strong> Gets your wallet ready to hold USDC on Rome.
              </li>
              <li>
                <strong>Wrap.</strong> On Rome your USDC comes in two forms: one pays network fees, the other is used for
                payments. This turns some of the first into the second.
              </li>
              <li>
                <strong>Grant access.</strong> A one-time permission that lets Rome use your payment-form USDC.
              </li>
              <li>
                <strong>Approve.</strong> Allows the payment contract to take exactly the amount you are paying, nothing
                more.
              </li>
              <li>
                <strong>Pay.</strong> The payment itself.
              </li>
            </ul>
            <p>Steps you have already done are skipped next time, so later payments take one or two confirmations.</p>
          </>
        ),
      },
      {
        q: "What will it cost me on top of the amount?",
        a: (
          <p>
            The amount on the page is what you pay. Rome Pay&rsquo;s fee comes out of the merchant&rsquo;s side, not yours. You
            also pay the network&rsquo;s small processing fee, which on Rome is charged in USDC. With Solflare you need a
            little SOL as well, because Solana charges its fees in SOL.
          </p>
        ),
      },
      {
        q: "What if something fails, or I close the page halfway?",
        a: (
          <p>
            Nothing is lost. A failed step does not take your money, and finished steps stay finished. Open the link again,
            connect your wallet and carry on from where you stopped. If a balance looks out of date, use{" "}
            <em>Check my balance again</em>. Only the final Pay step sends money to the merchant.
          </p>
        ),
      },
      {
        q: "Where do I get test USDC?",
        a: (
          <p>
            Take free test USDC from the{" "}
            <a href="https://faucet.circle.com/" target="_blank" rel="noreferrer">
              Circle faucet
            </a>{" "}
            (choose Solana Devnet or Ethereum Sepolia). Then move it onto Rome with the{" "}
            <a href="https://bridge-api.devnet.romeprotocol.xyz/?chain=200010" target="_blank" rel="noreferrer">
              Rome bridge
            </a>
            . Solflare users can pay straight from Devnet USDC.
          </p>
        ),
      },
      {
        q: "Can I get a refund?",
        a: (
          <p>
            A payment on the blockchain cannot be undone, and Rome Pay cannot take it back. If you need your money back, ask
            the merchant to send it to you. Check the amount and the recipient before you press Pay.
          </p>
        ),
      },
    ],
  },
  {
    title: "Getting paid",
    items: [
      {
        q: "How do I create a payment link?",
        a: (
          <ol>
            <li>
              Open the <Link href="/dashboard">Dashboard</Link> and sign in with your wallet.
            </li>
            <li>
              In <em>New payment link</em>, choose a fixed amount or let the payer enter it, and write what it is for.
            </li>
            <li>Press Create link, then copy it and send it to your customer or post it anywhere.</li>
          </ol>
        ),
      },
      {
        q: "What kinds of links can I make?",
        a: (
          <ul>
            <li>
              <strong>Invoice:</strong> a fixed amount that can be paid once. Good for a specific order.
            </li>
            <li>
              <strong>Price tag:</strong> a fixed amount that can be paid again and again. Good for a product or a service
              you sell repeatedly.
            </li>
            <li>
              <strong>Donation or tip:</strong> the payer types any amount they like.
            </li>
          </ul>
        ),
      },
      {
        q: "When and where do I get my money?",
        a: (
          <>
            <p>
              Right away. The payment moves from the payer to your wallet in a single transaction. Rome Pay never holds it
              in between. It arrives at the address you signed in with.
            </p>
            <p>
              If you signed in with Solflare, the money lands on your wallet&rsquo;s Rome address. The dashboard shows that
              balance with a <em>Move to Solflare</em> button that sends it to your normal Solana wallet.
            </p>
          </>
        ),
      },
      {
        q: "How will I know I have been paid?",
        a: (
          <p>
            The payment appears in your dashboard history a few seconds after Rome confirms it, with the payer, the amount,
            the fee and a receipt link. You can also get a Telegram message for every payment, or have a payment sent to
            your own website through a webhook. Both are set up from the dashboard.
          </p>
        ),
      },
      {
        q: "Can I close or delete a link?",
        a: (
          <p>
            Yes. <em>Close</em> stops a link from accepting new payments, and you can reopen it later. A link that never
            received a payment can be deleted. Links that were paid stay in your history so each payment still shows what it
            was for.
          </p>
        ),
      },
    ],
  },
  {
    title: "Fees and safety",
    items: [
      {
        q: "What does Rome Pay charge?",
        a: (
          <>
            <p>
              1% of each payment, taken in the same transaction. There is no signup fee and no monthly charge. For example,
              on a 10 USDC payment the payer sends 10.00, the merchant gets 9.90 and Rome Pay gets 0.10.
            </p>
            <p>
              The fee is set in the payment contract, which refuses any fee above 1%. Each change is recorded publicly on
              the block explorer.
            </p>
          </>
        ),
      },
      {
        q: "Does Rome Pay hold my money?",
        a: (
          <p>
            No. The payment contract moves the USDC from the payer to the merchant (and the fee to Rome Pay) in one
            transaction and keeps nothing. Rome Pay cannot freeze, delay or spend your funds.
          </p>
        ),
      },
      {
        q: "Is the “Approve” step safe?",
        a: (
          <p>
            Yes. It allows only the Rome Pay payment contract, and only for the exact amount you are paying. The contract
            can take money only from the wallet that is paying, so nobody else can use that permission.
          </p>
        ),
      },
      {
        q: "My wallet shows a security warning. What should I do?",
        a: (
          <p>
            Wallets sometimes warn about sites they have not seen much before. Do not confirm anything you do not
            understand. Check that the amount and the recipient on the page match what you expected, and that each wallet
            prompt matches the step the page shows. If anything looks different, stop and ask the merchant.
          </p>
        ),
      },
      {
        q: "Are payments private?",
        a: (
          <p>
            No. Like all blockchain payments, the amount and both wallet addresses are public on the block explorer. Rome
            Pay does not ask for your name, email or card details.
          </p>
        ),
      },
    ],
  },
];

export default function FaqPage() {
  return (
    <div className={d.page}>
      <SiteHeader current="faq" />
      <main className={f.main}>
        <h1 className={f.title}>Questions and answers</h1>
        <p className={f.lead}>How Rome Pay works, in plain words.</p>

        {GROUPS.map((group) => (
          <section key={group.title} className={f.group} aria-labelledby={`${slug(group.title)}-title`}>
            <h2 id={`${slug(group.title)}-title`} className={f.groupTitle}>
              {group.title}
            </h2>
            {group.items.map((item) => (
              <details key={item.q} className={f.item}>
                <summary>{item.q}</summary>
                <div className={f.answer}>{item.a}</div>
              </details>
            ))}
          </section>
        ))}

        <div className={f.end}>
          <Link className={f.cta} href="/dashboard">
            Create a payment link
          </Link>
          <Link className={f.back} href="/pay/demo">
            Try the demo checkout
          </Link>
        </div>
      </main>
    </div>
  );
}

const slug = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, "-");
