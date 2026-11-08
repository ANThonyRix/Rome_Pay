import { isIP } from "node:net";

// Decides whether an IP address is a public internet address. Pure, so it can be tested on its own.
// IPv4 uses a deny list of reserved ranges. IPv6 uses an allow list: only global unicast 2000::/3
// qualifies, which removes every IPv4-mapped (::ffff:a.b.c.d), NAT64 (64:ff9b::/96), unique-local,
// link-local and site-local form in one rule. Within 2000::/3 the Teredo, 6to4 and documentation
// ranges are refused too, because they embed or stand in for other addresses.

const V4_DENY: ReadonlyArray<readonly [number, number, number]> = [
  // [first octet, second octet min, second octet max]; the full third/fourth octets are not needed
  [0, 0, 255], // 0.0.0.0/8 "this" network
  [10, 0, 255], // 10.0.0.0/8 private
  [100, 64, 127], // 100.64.0.0/10 carrier-grade NAT
  [127, 0, 255], // 127.0.0.0/8 loopback
  [169, 254, 254], // 169.254.0.0/16 link-local, cloud metadata
  [172, 16, 31], // 172.16.0.0/12 private
  [192, 168, 168], // 192.168.0.0/16 private
  [198, 18, 19], // 198.18.0.0/15 benchmarking
];

function isPrivateV4(ip: string): boolean {
  const [a, b, c] = ip.split(".").map(Number);
  if (V4_DENY.some(([first, lo, hi]) => a === first && b >= lo && b <= hi)) return true;
  if (a === 192 && b === 0 && (c === 0 || c === 2)) return true; // 192.0.0.0/24, 192.0.2.0/24
  if (a === 198 && b === 51 && c === 100) return true; // 198.51.100.0/24 documentation
  if (a === 203 && b === 0 && c === 113) return true; // 203.0.113.0/24 documentation
  return a >= 224; // multicast, reserved, broadcast
}

/** The first two 16-bit groups of an IPv6 address, or null when it cannot be read. */
function leadingGroups(ip: string): [number, number] | null {
  const zone = ip.indexOf("%");
  const text = (zone === -1 ? ip : ip.slice(0, zone)).toLowerCase();
  const head = text.includes("::") ? text.split("::")[0] : text;
  const groups = head === "" ? [] : head.split(":");
  const parse = (g: string | undefined) => (g === undefined ? 0 : /^[0-9a-f]{1,4}$/.test(g) ? parseInt(g, 16) : NaN);
  const first = parse(groups[0]);
  const second = parse(groups[1]);
  return Number.isNaN(first) || Number.isNaN(second) ? null : [first, second];
}

function isPrivateV6(ip: string): boolean {
  const lead = leadingGroups(ip);
  if (!lead) return true;
  const [first, second] = lead;
  if (first < 0x2000 || first > 0x3fff) return true; // outside 2000::/3
  if (first === 0x2001 && (second === 0 || second === 0x0db8)) return true; // Teredo, documentation
  if (first === 0x2002) return true; // 6to4 embeds an IPv4 address
  return false;
}

/** True for anything that is not a public address (and for text that is not an IP at all). */
export function isPrivateIp(ip: string): boolean {
  const version = isIP(ip);
  if (version === 4) return isPrivateV4(ip);
  if (version === 6) return isPrivateV6(ip);
  return true;
}
