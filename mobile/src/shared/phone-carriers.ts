/**
 * SMS email-to-text carriers, shared by the web settings dropdown, the mobile
 * Settings picker and the reminder sender in server.ts.
 *
 * `id` is the exact string saved in `user_settings.phone_carrier`. Never
 * rename an existing id: people's saved carriers would stop matching.
 */
export interface PhoneCarrier {
  /** Value stored in user settings (lowercase). */
  id: string;
  /** Name shown in settings. */
  label: string;
  /** Email-to-text gateway domain the reminder is sent to. */
  gatewayDomain: string;
}

export const PHONE_CARRIERS: readonly PhoneCarrier[] = [
  { id: "verizon", label: "Verizon", gatewayDomain: "vtext.com" },
  { id: "att", label: "AT&T", gatewayDomain: "txt.att.net" },
  { id: "tmobile", label: "T-Mobile", gatewayDomain: "tmomail.net" },
  { id: "sprint", label: "Sprint", gatewayDomain: "messaging.sprintpcs.com" },
  { id: "googlefi", label: "Google Fi", gatewayDomain: "msg.fi.google.com" },
  { id: "boost", label: "Boost Mobile", gatewayDomain: "myboostmobile.com" },
  { id: "cricket", label: "Cricket Wireless", gatewayDomain: "sms.cricketwireless.net" },
  { id: "uscellular", label: "US Cellular", gatewayDomain: "email.uscc.net" },
];

/** Label shown when no carrier is picked (SMS goes through Twilio). */
export const NO_PHONE_CARRIER_LABEL = "None (Twilio)";

/** Carrier for a saved value, matched case-insensitively, or undefined. */
export function findPhoneCarrier(value: string | null | undefined): PhoneCarrier | undefined {
  if (!value) return undefined;
  const id = value.trim().toLowerCase();
  return PHONE_CARRIERS.find((carrier) => carrier.id === id);
}

/** Email-to-text gateway domain for a saved carrier value, or undefined. */
export function phoneCarrierGatewayDomain(value: string | null | undefined): string | undefined {
  return findPhoneCarrier(value)?.gatewayDomain;
}
