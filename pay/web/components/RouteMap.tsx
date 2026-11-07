import type { Lane, StepId, StepResult } from "@/lib/payflow";
import s from "./route.module.css";

export type StationState = "todo" | "skip" | "busy" | "done" | "failed";

interface Plate {
  name: string;
  does: string;
  cost: string;
}

/** Fixed name plates: the words never change between states, only the mark does. */
function plateFor(step: StepId, lane: Lane, p: { amount: string; feeLabel: string; fundAmount: string | null }): Plate {
  const sign = lane === "evm" ? "1 confirmation" : "2 signatures";
  switch (step) {
    case "provision":
      return { name: "Account", does: "Opens your Rome account for this Solana wallet", cost: `Once per wallet · ${sign}` };
    case "wrap":
      return { name: "Wrap", does: "Turns USDC on Rome into wUSDC, the token PayRouter takes", cost: `Only when short · ${sign}` };
    case "fund":
      return { name: "Fund", does: "Moves USDC from Solana into your Rome account", cost: `Only the missing amount · 1 signature` };
    case "grant":
      return { name: "Grant", does: "Lets the wUSDC wrapper move your tokens", cost: `Once per wallet · ${sign}` };
    case "approve":
      return { name: "Approve", does: `Lets PayRouter take exactly ${p.amount} wUSDC`, cost: `This payment · ${sign}` };
    case "pay":
      return { name: "PayRouter", does: `Pays ${p.amount} USDC to the merchant in one transaction`, cost: `Fee ${p.feeLabel} · ${sign}` };
  }
}

const STATE_LABEL: Record<StationState, string> = {
  todo: "To do",
  skip: "Done earlier",
  busy: "In progress",
  done: "Done",
  failed: "Failed",
};

export default function RouteMap(props: {
  lane: Lane;
  steps: StepId[];
  states: Partial<Record<StepId, StationState>>;
  results: Partial<Record<StepId, StepResult>>;
  amount: string;
  merchant: string;
  merchantAddress: string;
  feeLabel: string;
  fundAmount: string | null;
  arrived: boolean;
}) {
  const { lane, steps, states, arrived } = props;
  return (
    <ol className={s.route} data-lane={lane} data-arrived={arrived || undefined} aria-label="Stations on your route">
      {steps.map((id) => {
        const state = states[id];
        const plate = plateFor(id, lane, props);
        const cleared = state === "done" || state === "skip";
        return (
          <li key={id} className={s.station} data-kind={id === "pay" ? "interchange" : "stop"} data-state={state ?? "idle"} data-cleared={cleared || undefined}>
            <span className={s.track} aria-hidden="true">
              {/* The other wallet's line joins at the interchange, so the ring still reads as a meeting point. */}
              {id === "pay" ? <span className={s.stub} /> : null}
              <span className={s.mark} />
            </span>
            <span className={s.plate}>
              <span className={s.name}>{plate.name}</span>
              <span className={s.does}>{plate.does}</span>
              <span className={s.cost}>{plate.cost}</span>
              <span className={s.state}>{state ? STATE_LABEL[state] : "Connect to check"}</span>
            </span>
          </li>
        );
      })}
      <li className={s.station} data-kind="terminus" data-state={arrived ? "done" : "idle"}>
        <span className={s.track} aria-hidden="true">
          <span className={s.mark} />
        </span>
        <span className={s.plate}>
          <span className={s.name}>{props.merchant}</span>
          <span className={s.does}>Receives {props.amount} USDC</span>
          <span className={s.cost}>{props.merchantAddress}</span>
          <span className={s.state}>{arrived ? "Arrived" : "Waiting"}</span>
        </span>
      </li>
    </ol>
  );
}
